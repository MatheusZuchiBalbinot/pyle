// Must run before any other import: the configuration readers need
// process.env populated.
import '@pyle/shared/config/load-backend-env.js';

import { Agent, request as httpRequest, type IncomingMessage } from 'node:http';
import { parseArgs } from 'node:util';

import { backendPath } from '@pyle/shared/config/backend-root.js';
import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';

import { MANIFEST_FILE_NAME, readManifest } from '../apps/control-plane/src/seed/consumer-keys-manifest.js';
import { DEMO_LIVE_RPS } from '../apps/control-plane/src/seed/demo-traffic.js';
import { SeedAdminApiClient } from '../apps/control-plane/src/seed/seed-admin-api.client.js';
import { BotSummary, routePrefixOf } from './load-bot/bot-summary.js';
import { budgetViolations, formatPercent, type RunBudget } from './load-bot/budget.js';
import { BOT_PROFILE_NAMES, isBotProfileName, requestsForTick, targetRps, type BotProfileName } from './load-bot/profiles.js';
import { planRequest, type PlannedRequest } from './load-bot/request-plan.js';

// npm run bot -- [profile] [--duration 60] [--rps 550] [--max-p95-ms 250] [--max-error-rate 0.01]
// Sends demo traffic through the gateway with the seeded consumers' keys.
// Without --duration it runs until stopped, so the console always has live
// traffic to show. With a budget it exits 1 when the run went over it (CI).
// BOT_PROFILE and BOT_RPS set the profile and rate when the command line
// does not (the Compose service); the flags win.

const DEFAULT_PROFILE: BotProfileName = 'mixed';
const WAIT_POLL_MS = 3000;
const DEFAULT_GATEWAY_URL = 'http://localhost:8080';
const DEFAULT_CONTROL_PLANE_URL = 'http://localhost:3000';
const TICK_MS = 100;
const REPORT_EVERY_MS = 5000;
const MAX_IN_FLIGHT = 200;
const REQUEST_TIMEOUT_MS = 30_000;
const INSTANCE_HEADER = 'x-pyle-instance';
const NETWORK_ERROR_STATUS = 0;
// The chaos profile: a fault every 30 s, cleared 20 s later, cycling
// through the three kinds.
const CHAOS_EVERY_MS = 30_000;
const CHAOS_LASTS_MS = 20_000;
const NO_CHAOS: ChaosState = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };
const CHAOS_FAULTS: readonly ChaosState[] = [
	{ ...NO_CHAOS, latencyMs: 1500 },
	{ ...NO_CHAOS, errorRate: 0.5 },
	{ ...NO_CHAOS, isDown: true },
];

// durationSeconds null: until stopped.
type BotOptions = { readonly profile: BotProfileName; readonly durationSeconds: number | null; readonly rps: number; readonly budget: RunBudget };

type ChaosTarget = { readonly serviceSlug: string; readonly instanceId: string; readonly name: string };

// Turns faults on and off on the demo instances, and always cleans up.
class ChaosDriver {
	private readonly active = new Set<ChaosTarget>();
	private faultIndex = 0;

	constructor(private readonly client: SeedAdminApiClient) {}

	async injectNext(): Promise<void> {
		const services = await this.client.listServices();
		const targets = services.flatMap((service) =>
			service.instances.map((instance) => ({ serviceSlug: service.slug, instanceId: instance.id, name: instance.name })),
		);

		if (targets.length === 0) {
			return;
		}

		const target = targets[Math.floor(Math.random() * targets.length)];
		const fault = CHAOS_FAULTS[this.faultIndex % CHAOS_FAULTS.length];

		this.faultIndex++;
		await this.client.setChaos(target.serviceSlug, target.instanceId, fault);
		this.active.add(target);
		console.log(`[bot] chaos on ${target.name}: ${JSON.stringify(fault)}`);
		setTimeout(() => void this.clear(target), CHAOS_LASTS_MS).unref();
	}

	async clearAll(): Promise<void> {
		await Promise.all([...this.active].map((target) => this.clear(target)));
	}

	private async clear(target: ChaosTarget): Promise<void> {
		if (!this.active.delete(target)) {
			return;
		}

		await this.client
			.clearChaos(target.serviceSlug, target.instanceId)
			.catch((error: unknown) => console.error(`[bot] could not clear chaos on ${target.name}: ${String(error)}`));
		console.log(`[bot] chaos cleared on ${target.name}`);
	}
}

class LoadBot {
	private readonly summary = new BotSummary();
	private readonly agent = new Agent({ keepAlive: true, maxSockets: MAX_IN_FLIGHT });
	private readonly startedAt = Date.now();
	private inFlight = 0;
	private carry = 0;
	private isStopping = false;

	constructor(
		private readonly options: BotOptions,
		private readonly keys: Readonly<Record<string, readonly string[]>>,
		private readonly gatewayUrl: string,
		private readonly chaos: ChaosDriver | null,
	) {}

	// Resolves to whether the run stayed within its budget.
	async run(): Promise<boolean> {
		console.log(
			`[bot] ${this.options.profile} at ${this.options.rps} req/s ${describeDuration(this.options.durationSeconds)} against ${this.gatewayUrl}`,
		);
		const tick = setInterval(() => this.tick(), TICK_MS);
		const report = setInterval(() => this.reportWindow(), REPORT_EVERY_MS);
		const chaosTimer = this.chaos ? setInterval(() => void this.injectChaos(), CHAOS_EVERY_MS) : null;

		await new Promise<void>((resolve) => {
			const finish = (): void => resolve();

			process.once('SIGINT', finish);
			process.once('SIGTERM', finish);

			if (this.options.durationSeconds !== null) {
				setTimeout(finish, this.options.durationSeconds * 1000);
			}
		});
		this.isStopping = true;
		clearInterval(tick);
		clearInterval(report);

		if (chaosTimer) {
			clearInterval(chaosTimer);
		}

		await this.chaos?.clearAll();
		await this.drain();
		this.agent.destroy();
		console.log(`\n${this.summary.report()}`);

		return this.judge();
	}

	private reportWindow(): void {
		const target = targetRps(this.options.profile, this.options.rps, Date.now() - this.startedAt);
		const line = this.summary.takeWindowLine(REPORT_EVERY_MS / 1000);

		console.log(`[target ${target.toFixed(0)}] ${line}`);
	}

	private judge(): boolean {
		const totals = this.summary.totals();
		const violations = budgetViolations(totals, this.options.budget);
		const p95 = totals.p95Ms === null ? '-' : `${totals.p95Ms} ms`;

		console.log(`\n[bot] run p95 ${p95}, server errors ${formatPercent(totals.serverErrorRate)}`);

		for (const violation of violations) {
			console.error(`[bot] over budget: ${violation}`);
		}

		return violations.length === 0;
	}

	private tick(): void {
		const rps = targetRps(this.options.profile, this.options.rps, Date.now() - this.startedAt);
		const budget = requestsForTick(rps, TICK_MS, this.carry);

		this.carry = budget.carry;

		for (let index = 0; index < budget.count; index++) {
			// Past the cap the bot is ahead of what the gateway serves: skip,
			// rather than pile up.
			if (this.inFlight >= MAX_IN_FLIGHT) {
				return;
			}

			this.send(planRequest(this.options.profile, this.keys, Math.random));
		}
	}

	private send(planned: PlannedRequest): void {
		this.inFlight++;
		const startedAt = performance.now();
		const headers: Record<string, string> = {};

		if (planned.apiKey !== null) {
			headers.authorization = `Bearer ${planned.apiKey}`;
		}

		if (planned.body !== null) {
			headers['content-type'] = 'application/json';
		}

		const finish = (status: number, response: IncomingMessage | null): void => {
			this.inFlight--;
			const instance = response?.headers[INSTANCE_HEADER];

			this.summary.add({
				routePrefix: routePrefixOf(planned.path),
				status,
				instance: typeof instance === 'string' ? instance : null,
				latencyMs: performance.now() - startedAt,
			});
		};

		const outgoing = httpRequest(
			`${this.gatewayUrl}${planned.path}`,
			{ method: planned.method, headers, agent: this.agent, timeout: REQUEST_TIMEOUT_MS },
			(response) => {
				response.resume();
				response.once('end', () => finish(response.statusCode ?? NETWORK_ERROR_STATUS, response));
			},
		);

		outgoing.once('timeout', () => outgoing.destroy());
		outgoing.once('error', () => finish(NETWORK_ERROR_STATUS, null));
		outgoing.end(planned.body ?? undefined);
	}

	private async injectChaos(): Promise<void> {
		if (this.isStopping) {
			return;
		}

		await this.chaos?.injectNext().catch((error: unknown) => console.error(`[bot] chaos failed: ${String(error)}`));
	}

	private async drain(): Promise<void> {
		while (this.inFlight > 0) {
			await new Promise((resolve) => setTimeout(resolve, TICK_MS));
		}
	}
}

function isPositive(value: number | null): boolean {
	return value === null || (Number.isFinite(value) && value > 0);
}

function readOptionalNumber(value: string | undefined): number | null {
	return value === undefined ? null : Number(value);
}

// Compose passes an unset variable as an empty string: both mean "not set".
function readEnv(name: string): string | undefined {
	const value = process.env[name];

	return value === '' ? undefined : value;
}

function fail(message: string): never {
	console.error(`[bot] ${message}`);
	process.exit(1);
}

function parseOptions(): BotOptions {
	const optionTypes = {
		duration: { type: 'string' },
		rps: { type: 'string' },
		'max-p95-ms': { type: 'string' },
		'max-error-rate': { type: 'string' },
	} as const;
	const { values, positionals } = parseArgs({ options: optionTypes, allowPositionals: true });
	const profile = positionals[0] ?? readEnv('BOT_PROFILE') ?? DEFAULT_PROFILE;

	if (!isBotProfileName(profile)) {
		fail(`Unknown profile "${profile}"; one of ${BOT_PROFILE_NAMES.join(', ')}`);
	}

	const durationSeconds = readOptionalNumber(values.duration);
	const rps = Number(values.rps ?? readEnv('BOT_RPS') ?? DEMO_LIVE_RPS);
	const budget: RunBudget = { maxP95Ms: readOptionalNumber(values['max-p95-ms']), maxServerErrorRate: readOptionalNumber(values['max-error-rate']) };
	const isValid = [durationSeconds, rps, budget.maxP95Ms, budget.maxServerErrorRate].every(isPositive);

	if (!isValid) {
		fail('--duration, --rps (BOT_RPS), --max-p95-ms and --max-error-rate must be positive numbers');
	}

	const hasBudget = budget.maxP95Ms !== null || budget.maxServerErrorRate !== null;

	if (hasBudget && durationSeconds === null) {
		fail('A budget needs --duration: a run that never ends is never judged');
	}

	return { profile, durationSeconds, rps, budget };
}

function pause(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// Started together with the stack, the bot may come up before the seed has
// written the keys: it waits for them instead of failing.
async function waitForManifest(path: string): Promise<Readonly<Record<string, readonly string[]>>> {
	let isAnnounced = false;

	for (;;) {
		const keys = readManifest(path);

		if (keys !== null) {
			return keys;
		}

		if (!isAnnounced) {
			console.log(`[bot] waiting for ${path}: run "npm run seed" (with the control plane running)`);
		}

		isAnnounced = true;
		await pause(WAIT_POLL_MS);
	}
}

function isGatewayUp(gatewayUrl: string): Promise<boolean> {
	return new Promise((resolve) => {
		const probe = httpRequest(gatewayUrl, { method: 'GET', timeout: WAIT_POLL_MS }, (response) => {
			response.resume();
			resolve(true);
		});

		probe.once('timeout', () => probe.destroy());
		probe.once('error', () => resolve(false));
		probe.end();
	});
}

// Any HTTP answer (a 404 included) means the gateway is listening.
async function waitForGateway(gatewayUrl: string): Promise<void> {
	let isAnnounced = false;

	while (!(await isGatewayUp(gatewayUrl))) {
		if (!isAnnounced) {
			console.log(`[bot] waiting for the gateway at ${gatewayUrl}`);
		}

		isAnnounced = true;
		await pause(WAIT_POLL_MS);
	}
}

function describeDuration(durationSeconds: number | null): string {
	if (durationSeconds === null) {
		return 'until stopped (Ctrl+C)';
	}

	return `for ${durationSeconds} s (Ctrl+C to stop early)`;
}

async function main(): Promise<void> {
	const options = parseOptions();
	const manifestPath = process.env.BOT_KEYS_FILE || backendPath(MANIFEST_FILE_NAME);
	const gatewayUrl = process.env.SEED_GATEWAY_URL || DEFAULT_GATEWAY_URL;
	const keys = await waitForManifest(manifestPath);

	await waitForGateway(gatewayUrl);
	const token = process.env.ADMIN_API_TOKEN;
	const isChaos = options.profile === 'chaos';

	if (isChaos && !token) {
		fail('The chaos profile drives the admin API: set ADMIN_API_TOKEN');
	}

	const client = new SeedAdminApiClient({ baseUrl: process.env.SEED_CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE_URL, token: token ?? '' });
	const chaos = isChaos ? new ChaosDriver(client) : null;
	const isWithinBudget = await new LoadBot(options, keys, gatewayUrl, chaos).run();

	if (!isWithinBudget) {
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)));
