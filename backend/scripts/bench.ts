// Must run before any other import: the configuration readers need backend/.env.
import '@pyle/shared/config/load-backend-env.js';

import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { cpus, release, tmpdir, totalmem } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { backendPath } from '@pyle/shared/config/backend-root.js';
import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

import { SeedAdminApiClient } from '../apps/control-plane/src/seed/seed-admin-api.client.js';
import { parseK6Summary, renderReport, shouldStopTarget, type StepResult } from './bench/bench-report.js';
import { renderProxyConfig, renderUpstreamConfig, type NginxPaths } from './bench/nginx-configs.js';
import { BENCH_KEYED_PREFIX, BENCH_OPEN_PREFIX, createBenchConfig, removeBenchConfig } from './bench/pyle-bench-config.js';

// npm run bench -- [--steps 1000,2000,...] [--duration 10s] [--targets direct,pyle-open,...]
// How far each target goes before it breaks: the same fast upstream reached directly,
// through nginx (one worker, and all of them) and through the gateway (a public route, and
// one with an API key and a rate limit). Needs k6 and nginx (K6_BIN, NGINX_BIN) and the
// control plane on its own (npm run start:dev): the dev gateway and the load bot would
// share the CPU with the measurement. Writes backend/bench-results/<date>.md.

type BenchTarget = { readonly name: TargetName; readonly url: string; readonly apiKey: string | null };

type TargetName = (typeof TARGET_NAMES)[number];

type BenchOptions = {
	readonly steps: readonly number[];
	readonly duration: string;
	readonly targets: readonly TargetName[];
};

type RunContext = { readonly scratchDirectory: string; readonly k6Bin: string };

const TARGET_NAMES = ['direct', 'nginx-1-worker', 'nginx-all-workers', 'pyle-open', 'pyle-keyed'] as const;
const DEFAULT_STEPS: readonly number[] = [1000, 2000, 4000, 6000, 8000, 12_000, 16_000, 24_000, 32_000, 48_000];
const DEFAULT_DURATION = '10s';
const WARMUP_RPS = 500;
const WARMUP_DURATION = '5s';
const REFERENCE_RPS = 1000;

const UPSTREAM_PORT = 48_400;
const NGINX_ONE_WORKER_PORT = 48_401;
const NGINX_ALL_WORKERS_PORT = 48_402;
const BENCH_GATEWAY_PORT = 48_480;
const BENCH_GATEWAY_ADMIN_PORT = 48_490;
const BENCH_GATEWAY_ID = 'bench-gateway';
// The upstream answers any path; the gateway strips its route prefix before forwarding.
const REQUEST_PATH = '/items/42';

const READY_TIMEOUT_MS = 30_000;
const READY_POLL_MS = 250;
const HTTP_OK = 200;
const DEFAULT_CONTROL_PLANE_URL = 'http://localhost:3000';
const RESULTS_DIRECTORY = 'bench-results';

const children: ChildProcess[] = [];

await main();

async function main(): Promise<void> {
	const options = readOptions();
	const client = new SeedAdminApiClient({
		baseUrl: process.env.SEED_CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE_URL,
		token: readRequiredEnv('ADMIN_API_TOKEN'),
	});
	const context: RunContext = { scratchDirectory: await mkdtemp(join(tmpdir(), 'pyle-bench-')), k6Bin: process.env.K6_BIN || 'k6' };

	async function handleInterrupt(): Promise<void> {
		await shutdown(client);
		process.exit(1);
	}

	process.once('SIGINT', () => void handleInterrupt());

	try {
		const steps = await runBenchmark(client, context, options);
		const reportPath = await writeReport(options, steps);

		console.log(`\n[bench] report written to ${reportPath}`);
	} finally {
		await shutdown(client);
	}
}

async function runBenchmark(client: SeedAdminApiClient, context: RunContext, options: BenchOptions): Promise<readonly StepResult[]> {
	await startNginxFleet(context.scratchDirectory);
	const config = await createBenchConfig(client, `http://127.0.0.1:${UPSTREAM_PORT}`);

	await startBenchGateway(context.scratchDirectory);
	const targets = buildTargets(config.apiKey).filter((target) => options.targets.includes(target.name));
	const results: StepResult[] = [];

	for (const target of targets) {
		results.push(...(await runTarget(context, target, options)));
	}

	return results;
}

// Steps up the offered rate until the target fails twice in a row.
async function runTarget(context: RunContext, target: BenchTarget, options: BenchOptions): Promise<readonly StepResult[]> {
	const steps: StepResult[] = [];

	await runK6(context, target, WARMUP_RPS, WARMUP_DURATION);

	for (const rate of options.steps) {
		const step = await runK6(context, target, rate, options.duration);

		steps.push(step);
		console.log(formatProgress(step));

		if (shouldStopTarget(steps)) {
			break;
		}
	}

	return steps;
}

async function runK6(context: RunContext, target: BenchTarget, rate: number, duration: string): Promise<StepResult> {
	const summaryPath = join(context.scratchDirectory, `${target.name}-${rate}.json`);
	const env = {
		...process.env,
		RATE: String(rate),
		DURATION: duration,
		TARGET_URL: target.url,
		API_KEY: target.apiKey ?? '',
		SUMMARY_PATH: summaryPath,
	};
	const script = backendPath('scripts', 'bench', 'k6-step.js');

	await runToCompletion(context.k6Bin, ['run', '--quiet', '--no-color', script], env);
	const metrics: unknown = JSON.parse(await readFile(summaryPath, 'utf8'));

	return parseK6Summary(target.name, rate, metrics);
}

async function startNginxFleet(directory: string): Promise<void> {
	const upstream: NginxPaths = { directory, name: 'upstream' };
	const oneWorker: NginxPaths = { directory, name: 'nginx-1-worker' };
	const allWorkers: NginxPaths = { directory, name: 'nginx-all-workers' };

	await startNginx(upstream, renderUpstreamConfig(upstream, UPSTREAM_PORT));
	await startNginx(oneWorker, renderProxyConfig({ paths: oneWorker, port: NGINX_ONE_WORKER_PORT, upstreamPort: UPSTREAM_PORT, workers: 1 }));
	await startNginx(allWorkers, renderProxyConfig({ paths: allWorkers, port: NGINX_ALL_WORKERS_PORT, upstreamPort: UPSTREAM_PORT, workers: 'auto' }));
	await waitForOk(`http://127.0.0.1:${UPSTREAM_PORT}/`);
	await waitForOk(`http://127.0.0.1:${NGINX_ONE_WORKER_PORT}/`);
	await waitForOk(`http://127.0.0.1:${NGINX_ALL_WORKERS_PORT}/`);
}

async function startNginx(paths: NginxPaths, config: string): Promise<void> {
	const configPath = join(paths.directory, `${paths.name}.conf`);

	await writeFile(configPath, config);
	startChild(
		process.env.NGINX_BIN || 'nginx',
		['-c', configPath, '-p', paths.directory, '-e', join(paths.directory, `${paths.name}-startup.log`)],
		process.env,
	);
}

// Built and alone: what would ship, without the dev gateway or the load bot beside it.
async function startBenchGateway(directory: string): Promise<void> {
	const env = {
		...process.env,
		GATEWAY_PORT: String(BENCH_GATEWAY_PORT),
		GATEWAY_ADMIN_PORT: String(BENCH_GATEWAY_ADMIN_PORT),
		GATEWAY_ID: BENCH_GATEWAY_ID,
	};
	const gateway = startChild(process.execPath, [backendPath('apps', 'gateway', 'dist', 'main.js')], env);
	const log = createWriteStream(join(directory, 'gateway.log'));

	gateway.stdout?.pipe(log);
	gateway.stderr?.pipe(log);
	await waitForOk(`http://127.0.0.1:${BENCH_GATEWAY_PORT}${BENCH_OPEN_PREFIX}${REQUEST_PATH}`);
}

function buildTargets(apiKey: string): readonly BenchTarget[] {
	return [
		{ name: 'direct', url: `http://127.0.0.1:${UPSTREAM_PORT}${REQUEST_PATH}`, apiKey: null },
		{ name: 'nginx-1-worker', url: `http://127.0.0.1:${NGINX_ONE_WORKER_PORT}${REQUEST_PATH}`, apiKey: null },
		{ name: 'nginx-all-workers', url: `http://127.0.0.1:${NGINX_ALL_WORKERS_PORT}${REQUEST_PATH}`, apiKey: null },
		{ name: 'pyle-open', url: `http://127.0.0.1:${BENCH_GATEWAY_PORT}${BENCH_OPEN_PREFIX}${REQUEST_PATH}`, apiKey: null },
		{ name: 'pyle-keyed', url: `http://127.0.0.1:${BENCH_GATEWAY_PORT}${BENCH_KEYED_PREFIX}${REQUEST_PATH}`, apiKey },
	];
}

async function writeReport(options: BenchOptions, steps: readonly StepResult[]): Promise<string> {
	const date = new Date().toISOString();
	const environment = await describeEnvironment(date);
	const report = renderReport({
		title: `Benchmark, ${date.slice(0, 10)}`,
		environment,
		targets: options.targets,
		steps,
		referenceRps: REFERENCE_RPS,
	});
	const directory = backendPath(RESULTS_DIRECTORY);
	const basename = date.replaceAll(':', '-');

	await mkdir(directory, { recursive: true });
	await writeFile(join(directory, `${basename}.md`), report);
	await writeFile(join(directory, `${basename}.json`), JSON.stringify(steps, null, '\t'));
	console.log(`\n${report}`);

	return join(directory, `${basename}.md`);
}

async function describeEnvironment(date: string): Promise<readonly string[]> {
	const cpu = cpus();
	const memoryGiB = (totalmem() / 1024 ** 3).toFixed(1);
	const k6Version = await captureOutput(process.env.K6_BIN || 'k6', ['version']);
	const nginxVersion = await captureOutput(process.env.NGINX_BIN || 'nginx', ['-v']);

	return [
		`${date}, ${cpu[0]?.model ?? 'unknown CPU'} (${cpu.length} threads), ${memoryGiB} GiB, Linux ${release()}`,
		`Node ${process.version} (the gateway, one process), ${nginxVersion}, ${k6Version}; everything on the same machine, over loopback`,
	];
}

async function shutdown(client: SeedAdminApiClient): Promise<void> {
	await removeBenchConfig(client).catch((error: unknown) => {
		// Best effort: the next run removes leftovers before it starts.
		console.error(`[bench] could not remove the bench configuration: ${String(error)}`);
	});

	for (const child of children) {
		child.kill('SIGTERM');
	}
}

function startChild(command: string, args: readonly string[], env: NodeJS.ProcessEnv): ChildProcess {
	const child = spawn(command, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });

	children.push(child);

	return child;
}

function runToCompletion(command: string, args: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
		let stderr = '';

		child.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		function handleClose(code: number | null): void {
			if (code !== 0) {
				return reject(new Error(`${command} exited with ${code}: ${stderr.trim()}`));
			}

			resolve();
		}

		child.on('error', reject);
		child.on('close', handleClose);
	});
}

function captureOutput(command: string, args: readonly string[]): Promise<string> {
	return new Promise((resolve) => {
		const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
		let output = '';

		child.stdout.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		// nginx -v prints to stderr.
		child.stderr.on('data', (chunk: Buffer) => {
			output += chunk.toString();
		});
		child.on('error', () => resolve(`${command} (version unknown)`));
		child.on('close', () => resolve(output.trim().split('\n')[0] ?? command));
	});
}

async function waitForOk(url: string): Promise<void> {
	const deadline = Date.now() + READY_TIMEOUT_MS;

	while (Date.now() < deadline) {
		const status = await fetch(url).then(
			(response) => response.status,
			() => null,
		);

		if (status === HTTP_OK) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, READY_POLL_MS));
	}

	throw new Error(`${url} did not answer 200 within ${READY_TIMEOUT_MS} ms`);
}

function formatProgress(step: StepResult): string {
	return `[bench] ${step.target.padEnd(18)} offered ${String(step.offeredRps).padStart(6)}  served ${Math.round(step.achievedRps).toString().padStart(6)}  p99 ${step.p99Ms.toFixed(2).padStart(8)} ms  errors ${(step.errorRate * 100).toFixed(2)}%`;
}

function readOptions(): BenchOptions {
	const { values } = parseArgs({ options: { steps: { type: 'string' }, duration: { type: 'string' }, targets: { type: 'string' } } });
	const steps = values.steps === undefined ? DEFAULT_STEPS : values.steps.split(',').map(Number);
	const targets = values.targets === undefined ? TARGET_NAMES : values.targets.split(',');
	const unknownTargets = targets.filter((name) => !isTargetName(name));
	const isValid = steps.every((step) => Number.isInteger(step) && step > 0) && unknownTargets.length === 0;

	if (!isValid) {
		throw new Error(`--steps must be positive integers and --targets one of ${TARGET_NAMES.join(', ')}`);
	}

	return { steps, duration: values.duration ?? DEFAULT_DURATION, targets: targets.filter(isTargetName) };
}

function isTargetName(value: string): value is TargetName {
	return (TARGET_NAMES as readonly string[]).includes(value);
}
