import 'dotenv/config';

import { PrismaClient, type Prisma } from '@prisma/control-plane-client';

import type { GatewayConfig } from '@pyle/shared/config/gateway.js';
import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';

import { getControlPlaneRedisUrl } from '../../apps/control-plane/src/config/control-plane-redis.js';
import { GatewayApp, type ExtensionBuilder, type GatewayAppOptions } from '../../apps/gateway/src/gateway-app.js';
import { GatewayLogger } from '../../apps/gateway/src/infrastructure/gateway-logger.js';
import { createGatewayPrisma } from '../../apps/gateway/src/infrastructure/gateway-prisma.js';
import { createGatewayRedis } from '../../apps/gateway/src/infrastructure/gateway-redis.js';
import { buildResilienceExtensions } from '../../apps/gateway/src/resilience/resilience-extension.js';
import { startFakeUpstream, type FakeUpstream } from '../../apps/gateway/src/testing/fake-upstream.js';

// Every route is open (no key, no limit), so each case is only about instances.
const RUN = `rse2e${Date.now()}`;
const FAST_CHECK_MS = 100;
// Long enough that no check lands during a test that is not about checks.
const QUIET_CHECK_MS = 600_000;
const CIRCUIT_COOLDOWN_MS = 500;
const SLOW_UPSTREAM_MS = 2000;
const WAIT_MS = 3000;
const POLL_MS = 50;
const CLOSED_PORT_URL = 'http://127.0.0.1:1';

type ServiceSetup = {
	readonly key: string;
	readonly instances: readonly { readonly name: string; readonly url: string; readonly weight?: number }[];
	readonly service: Partial<Prisma.ServiceCreateInput>;
};

function buildGatewayConfig(): GatewayConfig {
	return {
		gatewayId: `gw-${RUN}`,
		port: 0,
		adminPort: 0,
		databaseUrl: process.env.CONTROL_PLANE_DATABASE_URL ?? '',
		redisUrl: getControlPlaneRedisUrl(),
		configRefreshMs: 60_000,
		metricsFlushMs: 10_000,
		heartbeatMs: 5000,
		maxRequestTimeoutMs: 10_000,
		requestLogMaxEntries: 100,
		requestLogSuccessSampleRate: 1,
	};
}

describe('gateway resilience (e2e)', () => {
	const prisma = new PrismaClient();
	const upstreams = new Map<string, FakeUpstream>();
	const events: GatewayEvent[] = [];
	const instanceIds = new Map<string, string>();
	let gateway: GatewayApp;
	let baseUrl: string;

	async function upstream(name: string): Promise<FakeUpstream> {
		const started = await startFakeUpstream(name);

		upstreams.set(name, started);

		return started;
	}

	async function createService(setup: ServiceSetup): Promise<void> {
		const quiet = { healthCheckIntervalMs: QUIET_CHECK_MS, unhealthyThreshold: 100, circuitFailureThreshold: 100 };
		const data: Prisma.ServiceCreateInput = { slug: `${RUN}-${setup.key}`, name: setup.key, retryMaxAttempts: 1, ...quiet, ...setup.service };
		const service = await prisma.service.create({ data });

		for (const instance of setup.instances) {
			const created = await prisma.serviceInstance.create({ data: { serviceId: service.id, ...instance } });

			instanceIds.set(instance.name, created.id);
		}

		const route = { name: setup.key, pathPrefix: `/${RUN}/${setup.key}`, serviceId: service.id, isAuthRequired: false };

		await prisma.route.create({ data: route });
	}

	beforeAll(async () => {
		const [ejected, steady, broken, healthy, flaky, fast, slow, light, heavy] = await Promise.all(
			['ejected', 'steady', 'broken', 'healthy', 'flaky', 'fast', 'slow', 'light', 'heavy'].map(upstream),
		);
		const fastHealth = { healthCheckIntervalMs: FAST_CHECK_MS, healthyThreshold: 2, unhealthyThreshold: 2 };
		const circuit = { circuitFailureThreshold: 3, circuitCooldownMs: CIRCUIT_COOLDOWN_MS };
		const setups: readonly ServiceSetup[] = [
			{ key: 'health', service: fastHealth, instances: [ejected, steady].map((fake) => ({ name: fake.name, url: fake.url })) },
			{ key: 'circuit', service: circuit, instances: [broken, healthy].map((fake) => ({ name: fake.name, url: fake.url })) },
			{
				key: 'retry',
				service: { retryMaxAttempts: 2 },
				instances: [
					{ name: 'dead', url: CLOSED_PORT_URL },
					{ name: flaky.name, url: flaky.url },
				],
			},
			{
				key: 'least',
				service: { lbStrategy: 'least_connections', timeoutMs: 5000 },
				instances: [fast, slow].map((fake) => ({ name: fake.name, url: fake.url })),
			},
			{
				key: 'weighted',
				service: { lbStrategy: 'weighted_random' },
				instances: [
					{ name: light.name, url: light.url, weight: 1 },
					{ name: heavy.name, url: heavy.url, weight: 3 },
				],
			},
		];

		for (const setup of setups) {
			await createService(setup);
		}

		const config = buildGatewayConfig();
		const recordEvents: ExtensionBuilder = () => ({ eventSink: { emit: (event) => events.push(event) } });
		const options: GatewayAppOptions = {
			config,
			logger: new GatewayLogger(config.gatewayId, () => undefined),
			redis: createGatewayRedis(config.redisUrl),
			prisma: createGatewayPrisma(config.databaseUrl),
			extensions: [buildResilienceExtensions, recordEvents],
		};

		gateway = new GatewayApp(options);
		await gateway.start();
		baseUrl = `http://127.0.0.1:${gateway.ports.traffic}`;
	});

	afterAll(async () => {
		await gateway.stop();
		const services = await prisma.service.findMany({ where: { slug: { startsWith: RUN } } });
		const serviceIds = services.map((service) => service.id);

		await prisma.route.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
		await Promise.all([...upstreams.values()].map((fake) => fake.close()));
		await prisma.$disconnect();
	});

	function call(key: string, init: RequestInit = {}): Promise<Response> {
		return fetch(`${baseUrl}/${RUN}/${key}/item`, init);
	}

	async function servedBy(key: string, count: number): Promise<readonly string[]> {
		const names: string[] = [];

		for (let index = 0; index < count; index++) {
			names.push((await call(key)).headers.get('x-pyle-instance') ?? '');
		}

		return names;
	}

	async function eventually(check: () => Promise<boolean>): Promise<void> {
		const deadline = Date.now() + WAIT_MS;

		while (Date.now() < deadline) {
			if (await check()) {
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, POLL_MS));
		}

		throw new Error('The gateway did not get there in time');
	}

	// "kind:toState" of every transition the instance went through.
	function stateChanges(instanceName: string): readonly string[] {
		const instanceId = instanceIds.get(instanceName);

		return events.flatMap((event) => {
			const isAboutInstance = event.type === 'instance.state.changed' && event.instanceId === instanceId;

			return isAboutInstance ? [`${event.kind}:${event.toState}`] : [];
		});
	}

	it('takes an instance failing its health checks out of rotation, and back once it recovers', async () => {
		upstreams.get('ejected')?.setHealthStatus(503);
		await eventually(async () => (await servedBy('health', 4)).every((name) => name === 'steady'));

		upstreams.get('ejected')?.setHealthStatus(null);
		await eventually(async () => (await servedBy('health', 4)).includes('ejected'));
		expect(stateChanges('ejected')).toEqual(expect.arrayContaining(['health:unhealthy', 'health:healthy']));
	});

	it('opens the circuit of an instance failing requests, then closes it once it answers again', async () => {
		const broken = upstreams.get('broken') as FakeUpstream;

		broken.setBehavior({ kind: 'status', status: 500 });
		await eventually(async () => (await servedBy('circuit', 6)).every((name) => name === 'healthy'));
		expect(stateChanges('broken')).toContain('circuit:circuit_open');

		broken.setBehavior({ kind: 'echo' });
		await new Promise((resolve) => setTimeout(resolve, CIRCUIT_COOLDOWN_MS));
		await eventually(async () => (await servedBy('circuit', 4)).includes('broken'));
		expect(stateChanges('broken')).toEqual(expect.arrayContaining(['circuit:circuit_half_open', 'circuit:circuit_closed']));
	});

	it('retries an idempotent request on another instance when one refuses the connection', async () => {
		const responses = await Promise.all([call('retry'), call('retry')]);

		expect(responses.map((response) => response.status)).toEqual([200, 200]);
		const attempts = responses.map((response) => response.headers.get('x-pyle-attempts'));

		expect(attempts).toHaveLength(2);
		expect(attempts).toEqual(expect.arrayContaining(['1', '2']));
	});

	it('does not retry a POST: the one that hits the dead instance fails', async () => {
		const post: RequestInit = { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } };

		const responses = await Promise.all([call('retry', post), call('retry', post)]);
		const statuses = responses.map((response) => response.status);

		expect(statuses).toEqual(expect.arrayContaining([200, 502]));
	});

	it('least_connections sends concurrent traffic mostly to the fast instance', async () => {
		upstreams.get('slow')?.setBehavior({ kind: 'delay', delayMs: SLOW_UPSTREAM_MS });

		const names = await Promise.all(Array.from({ length: 20 }, async () => (await call('least')).headers.get('x-pyle-instance')));
		const fastCount = names.filter((name) => name === 'fast').length;

		expect(fastCount).toBeGreaterThanOrEqual(15);
	});

	it('weighted_random splits traffic by weight', async () => {
		const names = await servedBy('weighted', 400);
		const heavyShare = names.filter((name) => name === 'heavy').length / names.length;

		expect(Math.abs(heavyShare - 0.75)).toBeLessThanOrEqual(0.1);
	});
});
