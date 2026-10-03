import 'dotenv/config';

import { PrismaClient } from '@prisma/control-plane-client';
import { Redis } from 'ioredis';

import type { GatewayConfig } from '@pyle/shared/config/gateway.js';
import { hashApiKey } from '@pyle/shared/contracts/api-key.js';
import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { getControlPlaneRedisUrl } from '../../apps/control-plane/src/config/control-plane-redis.js';
import { GatewayApp } from '../../apps/gateway/src/gateway-app.js';
import { GatewayLogger } from '../../apps/gateway/src/infrastructure/gateway-logger.js';
import { createGatewayPrisma } from '../../apps/gateway/src/infrastructure/gateway-prisma.js';
import { createGatewayRedis } from '../../apps/gateway/src/infrastructure/gateway-redis.js';
import { startFakeUpstream, type FakeUpstream } from '../../apps/gateway/src/testing/fake-upstream.js';

const RUN = `gwe2e${Date.now()}`;
const PREFIX = `/api/${RUN}/orders`;
const OPEN_PREFIX = `/api/${RUN}/open`;
const API_KEY = `pyle_live_${RUN}_key`;
const CONSUMER_RATE_LIMIT = 4;
const SERVICE_TIMEOUT_MS = 300;
const RELOAD_WAIT_MS = 2000;
const POLL_INTERVAL_MS = 50;

type ResponseBody = Record<string, unknown>;

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
		maxRequestTimeoutMs: 5000,
		requestLogMaxEntries: 100,
		requestLogSuccessSampleRate: 1,
	};
}

describe('gateway data plane (e2e)', () => {
	const prisma = new PrismaClient();
	const publisher = new Redis(getControlPlaneRedisUrl());
	const upstreams: FakeUpstream[] = [];
	let gateway: GatewayApp;
	let baseUrl: string;
	let adminUrl: string;
	let serviceId: string;
	let consumerId: string;

	beforeAll(async () => {
		for (const name of ['one', 'two', 'three']) {
			upstreams.push(await startFakeUpstream(name));
		}

		const service = await prisma.service.create({
			data: { slug: `${RUN}-orders`, name: 'Pedidos', timeoutMs: SERVICE_TIMEOUT_MS, retryMaxAttempts: 1 },
		});

		serviceId = service.id;
		const instances = upstreams.map((upstream) => ({ serviceId, name: `${RUN}-${upstream.name}`, url: upstream.url }));

		await prisma.serviceInstance.createMany({ data: instances });
		await prisma.route.create({ data: { name: 'Pedidos', pathPrefix: PREFIX, serviceId, methods: ['GET', 'POST'] } });
		await prisma.route.create({ data: { name: 'Aberta', pathPrefix: OPEN_PREFIX, serviceId, isAuthRequired: false, stripPrefix: false } });
		const consumer = await prisma.consumer.create({ data: { slug: `${RUN}-app`, name: 'App', rateLimitPerMinute: CONSUMER_RATE_LIMIT } });

		consumerId = consumer.id;
		await prisma.apiKey.create({ data: { consumerId, keyHash: hashApiKey(API_KEY), keyPrefix: API_KEY.slice(0, 12) } });

		const config = buildGatewayConfig();
		const logger = new GatewayLogger(config.gatewayId, () => undefined);

		gateway = new GatewayApp({ config, logger, redis: createGatewayRedis(config.redisUrl), prisma: createGatewayPrisma(config.databaseUrl) });
		await gateway.start();
		baseUrl = `http://127.0.0.1:${gateway.ports.traffic}`;
		adminUrl = `http://127.0.0.1:${gateway.ports.admin}`;
	});

	afterAll(async () => {
		await gateway.stop();
		await prisma.consumerRouteAccess.deleteMany({ where: { consumerId } });
		await prisma.apiKey.deleteMany({ where: { consumerId } });
		await prisma.consumer.deleteMany({ where: { id: consumerId } });
		await prisma.route.deleteMany({ where: { serviceId } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId } });
		await prisma.service.deleteMany({ where: { id: serviceId } });
		await Promise.all(upstreams.map((upstream) => upstream.close()));
		await publisher.quit();
		await prisma.$disconnect();
	});

	beforeEach(() => {
		for (const upstream of upstreams) {
			upstream.setBehavior({ kind: 'echo' });
		}
	});

	function call(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);

		if (!headers.has('authorization')) {
			headers.set('authorization', `Bearer ${API_KEY}`);
		}

		return fetch(`${baseUrl}${path}`, { ...init, headers });
	}

	async function announce(entity: string, id: string): Promise<void> {
		await publisher.publish(CONFIG_CHANGED_CHANNEL, JSON.stringify({ entity, id, action: 'updated' }));
	}

	// Polls until the gateway's answer satisfies the check (a reload is
	// debounced and asynchronous). Polling must not trip the small consumer
	// limit, so the window is reset before every probe.
	async function eventually(check: () => Promise<boolean>): Promise<void> {
		const deadline = Date.now() + RELOAD_WAIT_MS;

		while (Date.now() < deadline) {
			await resetRateLimit();

			if (await check()) {
				return;
			}

			await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
		}

		throw new Error('The gateway did not pick up the change in time');
	}

	async function resetRateLimit(): Promise<void> {
		const keys = await publisher.keys(`pyle:gw:rl:*${consumerId}*`);

		if (keys.length > 0) {
			await publisher.del(...keys);
		}
	}

	it('reports ready with the loaded configuration', async () => {
		const live = await fetch(`${adminUrl}/health`);
		const ready = await fetch(`${adminUrl}/health/ready`);

		expect(live.status).toBe(200);
		expect(ready.status).toBe(200);
		expect(await ready.json()).toMatchObject({ status: 'ready', checks: { config: 'up', redis: 'up', postgres: 'up' } });
	});

	it('balances round-robin, strips the prefix and keeps the query', async () => {
		await resetRateLimit();
		const served: string[] = [];

		for (let index = 0; index < 3; index++) {
			const response = await call(`${PREFIX}/items/7?expand=true`);
			const body = (await response.json()) as ResponseBody;

			expect(body.url).toBe('/items/7?expand=true');
			expect(response.headers.get('x-pyle-route')).toBe('Pedidos');
			expect(response.headers.get('x-request-id')).toBeTruthy();
			served.push(String(body.name));
		}

		expect(new Set(served)).toEqual(new Set(['one', 'two', 'three']));
	});

	it('exposes what it served as Prometheus metrics on the admin port', async () => {
		const response = await fetch(`${adminUrl}/metrics`);
		const body = await response.text();

		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(body).toMatch(/^pyle_gateway_requests_total\{route="Pedidos",status_class="2xx"\} [1-9]\d*$/m);
		expect(body).toMatch(/^pyle_gateway_request_duration_seconds_count\{route="Pedidos"\} [1-9]\d*$/m);
		expect(body).toMatch(/^pyle_gateway_config_version\{gateway="[^"]+"\} \d+$/m);
	});

	it('forwards the request body and a request id to the upstream', async () => {
		await resetRateLimit();
		const init: RequestInit = {
			method: 'POST',
			body: JSON.stringify({ sku: 'x' }),
			headers: { 'content-type': 'application/json', 'x-request-id': `${RUN}-req` },
		};

		const response = await call(PREFIX, init);
		const body = (await response.json()) as ResponseBody;

		expect(body).toMatchObject({ method: 'POST', url: '/', body: '{"sku":"x"}' });
		expect(response.headers.get('x-request-id')).toBe(`${RUN}-req`);
	});

	it("keeps the caller's trace, naming the gateway as the instance's parent span", async () => {
		await resetRateLimit();
		const traceId = '4bf92f3577b34da6a3ce929d0e0e4736';
		const callerTraceparent = `00-${traceId}-00f067aa0ba902b7-01`;

		await call(`${PREFIX}/traced`, { headers: { traceparent: callerTraceparent } });

		const traced = upstreams.flatMap((upstream) => upstream.received).find((received) => received.url === '/traced');
		const forwarded = String(traced?.headers.traceparent);

		expect(forwarded).toMatch(new RegExp(`^00-${traceId}-[0-9a-f]{16}-01$`));
		expect(forwarded).not.toBe(callerTraceparent);
	});

	it('refuses requests without a valid key, and methods the route does not accept', async () => {
		const missing = await call(PREFIX, { headers: { authorization: '' } });
		const invalid = await call(PREFIX, { headers: { authorization: 'Bearer pyle_live_wrong' } });
		const wrongMethod = await call(PREFIX, { method: 'DELETE' });
		const unknown = await call(`/api/${RUN}/nothing`);

		expect(missing.status).toBe(401);
		expect(await missing.json()).toMatchObject({ error: 'missing_api_key' });
		expect(invalid.status).toBe(401);
		expect(await invalid.json()).toMatchObject({ error: 'invalid_api_key' });
		expect(wrongMethod.status).toBe(405);
		expect(wrongMethod.headers.get('allow')).toBe('GET, POST');
		expect(unknown.status).toBe(404);
	});

	it('serves open routes without a key and without stripping', async () => {
		const response = await fetch(`${baseUrl}${OPEN_PREFIX}/ping`);

		expect(response.status).toBe(200);
		expect(((await response.json()) as ResponseBody).url).toBe(`${OPEN_PREFIX}/ping`);
	});

	it('limits the consumer per minute and says when to come back', async () => {
		await resetRateLimit();
		const statuses: number[] = [];
		let last: Response | null = null;

		for (let index = 0; index <= CONSUMER_RATE_LIMIT; index++) {
			last = await call(PREFIX);
			statuses.push(last.status);
		}

		expect(statuses).toEqual([200, 200, 200, 200, 429]);
		expect(last?.headers.get('retry-after')).toBeTruthy();
		expect(await last?.json()).toMatchObject({ error: 'rate_limited', scope: 'consumer' });
		await resetRateLimit();
	});

	it('relays upstream errors as they are and names its own failures', async () => {
		await resetRateLimit();

		for (const upstream of upstreams) {
			upstream.setBehavior({ kind: 'status', status: 503 });
		}

		const relayed = await call(PREFIX);

		expect(relayed.status).toBe(503);
		expect(relayed.headers.get('x-pyle-instance')).toBeTruthy();

		for (const upstream of upstreams) {
			upstream.setBehavior({ kind: 'delay', delayMs: SERVICE_TIMEOUT_MS * 3 });
		}

		const timedOut = await call(PREFIX);

		expect(timedOut.status).toBe(504);
		expect(await timedOut.json()).toMatchObject({ error: 'upstream_timeout' });
		await resetRateLimit();
	});

	it('streams large responses through without buffering them', async () => {
		await resetRateLimit();

		for (const upstream of upstreams) {
			upstream.setBehavior({ kind: 'stream', chunkCount: 20, chunkBytes: 64 * 1024, pauseMs: 5 });
		}

		const response = await call(`${PREFIX}/export`);
		const bytes = await response.arrayBuffer();

		expect(response.status).toBe(200);
		expect(bytes.byteLength).toBe(20 * 64 * 1024);
	});

	it('picks up configuration changes: drained instances, then a revoked key', async () => {
		await resetRateLimit();
		await prisma.serviceInstance.updateMany({ where: { serviceId, name: { not: `${RUN}-one` } }, data: { isEnabled: false } });
		await announce('instance', serviceId);
		await eventually(async () => {
			const names = await Promise.all([0, 1, 2].map(async () => ((await (await call(`${PREFIX}/x`)).json()) as ResponseBody).name));

			return names.every((name) => name === 'one');
		});

		await prisma.serviceInstance.updateMany({ where: { serviceId }, data: { isEnabled: false } });
		await announce('instance', serviceId);
		await eventually(async () => (await call(PREFIX)).status === 503);
		await resetRateLimit();
		const drained = await call(PREFIX);

		expect(await drained.json()).toMatchObject({ error: 'no_healthy_instance' });

		await prisma.apiKey.updateMany({ where: { consumerId }, data: { revokedAt: new Date() } });
		await announce('api_key', consumerId);
		await eventually(async () => (await call(PREFIX)).status === 401);
	});
});
