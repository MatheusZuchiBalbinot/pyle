import 'dotenv/config';

import { PrismaClient } from '@prisma/control-plane-client';
import { Redis } from 'ioredis';

import type { GatewayConfig } from '@pyle/shared/config/gateway.js';
import { parseGatewayEvent, type GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';
import type { GatewayHeartbeat, InstanceLiveState } from '@pyle/shared/contracts/instance-live-state.js';
import { GATEWAY_EVENTS_CHANNEL, heartbeatKey, INSTANCE_STATE_HASH, REQUEST_LOG_LIST } from '@pyle/shared/contracts/redis-keys.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { getControlPlaneRedisUrl } from '../../apps/control-plane/src/config/control-plane-redis.js';
import { GatewayApp, type GatewayAppOptions } from '../../apps/gateway/src/gateway-app.js';
import { GatewayLogger } from '../../apps/gateway/src/infrastructure/gateway-logger.js';
import { createGatewayPrisma } from '../../apps/gateway/src/infrastructure/gateway-prisma.js';
import { createGatewayRedis } from '../../apps/gateway/src/infrastructure/gateway-redis.js';
import { buildResilienceExtensions } from '../../apps/gateway/src/resilience/resilience-extension.js';
import { buildTelemetryExtensions } from '../../apps/gateway/src/telemetry/telemetry-extension.js';
import { startFakeUpstream, type FakeUpstream } from '../../apps/gateway/src/testing/fake-upstream.js';

const RUN = `tle2e${Date.now()}`;
const GATEWAY_ID = `gw-${RUN}`;
const SUCCESS_COUNT = 90;
const NOT_FOUND_COUNT = 10;

function buildGatewayConfig(): GatewayConfig {
	return {
		gatewayId: GATEWAY_ID,
		port: 0,
		adminPort: 0,
		databaseUrl: process.env.CONTROL_PLANE_DATABASE_URL ?? '',
		redisUrl: getControlPlaneRedisUrl(),
		configRefreshMs: 60_000,
		metricsFlushMs: 10_000,
		heartbeatMs: 1000,
		maxRequestTimeoutMs: 5000,
		requestLogMaxEntries: 100,
		requestLogSuccessSampleRate: 0,
	};
}

describe('gateway telemetry (e2e)', () => {
	const prisma = new PrismaClient();
	const redis = new Redis(getControlPlaneRedisUrl());
	const subscriber = new Redis(getControlPlaneRedisUrl());
	const events: GatewayEvent[] = [];
	let upstream: FakeUpstream;
	let gateway: GatewayApp | null = null;
	let serviceId: string;
	let routeId: string;
	let instanceId: string;

	beforeAll(async () => {
		upstream = await startFakeUpstream('telemetry-1');
		const service = await prisma.service.create({ data: { slug: `${RUN}-svc`, name: 'Telemetria' } });

		serviceId = service.id;
		const instance = await prisma.serviceInstance.create({ data: { serviceId, name: `${RUN}-1`, url: upstream.url } });

		instanceId = instance.id;
		const route = await prisma.route.create({ data: { name: 'Telemetria', pathPrefix: `/${RUN}`, serviceId, isAuthRequired: false } });

		routeId = route.id;
		await subscriber.subscribe(GATEWAY_EVENTS_CHANNEL);
		subscriber.on('message', (_channel: string, message: string) => {
			const event = parseGatewayEvent(message);
			const isOurs = event !== null && event.gatewayId === GATEWAY_ID;

			if (isOurs) {
				events.push(event);
			}
		});

		const config = buildGatewayConfig();
		const options: GatewayAppOptions = {
			config,
			logger: new GatewayLogger(GATEWAY_ID, () => undefined),
			redis: createGatewayRedis(config.redisUrl),
			prisma: createGatewayPrisma(config.databaseUrl),
			extensions: [buildResilienceExtensions, buildTelemetryExtensions],
		};

		gateway = new GatewayApp(options);
		await gateway.start();
	});

	afterAll(async () => {
		await gateway?.stop();
		await prisma.routeInstanceSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.routeConsumerSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.route.deleteMany({ where: { serviceId } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId } });
		await prisma.service.deleteMany({ where: { id: serviceId } });
		await redis.hdel(INSTANCE_STATE_HASH, instanceId);
		await upstream.close();
		await subscriber.quit();
		await redis.quit();
		await prisma.$disconnect();
	});

	it('heartbeats and mirrors the instance state while running', async () => {
		await vi.waitFor(async () => {
			const raw = await redis.get(heartbeatKey(GATEWAY_ID));

			expect(raw).not.toBeNull();
			const heartbeat = JSON.parse(raw ?? '{}') as GatewayHeartbeat;

			expect(heartbeat).toMatchObject({ gatewayId: GATEWAY_ID, isRateLimitDegraded: false });
			const state = JSON.parse((await redis.hget(INSTANCE_STATE_HASH, instanceId)) ?? '{}') as InstanceLiveState;

			expect(state).toMatchObject({ instanceId, gatewayId: GATEWAY_ID });
		});
		expect(events.map((event) => event.type)).toContain('gateway.started');
	});

	it('turns 100 requests into samples, log entries and a flush event', async () => {
		const port = gateway?.ports.traffic;

		for (let index = 0; index < SUCCESS_COUNT; index++) {
			await (await fetch(`http://127.0.0.1:${port}/${RUN}/ok`)).arrayBuffer();
		}

		for (let index = 0; index < NOT_FOUND_COUNT; index++) {
			upstream.setBehavior({ kind: 'status', status: 404 });
			await (await fetch(`http://127.0.0.1:${port}/${RUN}/missing`)).arrayBuffer();
		}

		await gateway?.stop();
		gateway = null;

		const samples = await prisma.routeInstanceSample.findMany({ where: { gatewayId: GATEWAY_ID } });
		const requestCount = samples.reduce((sum, sample) => sum + sample.requestCount, 0);
		const histogramCount = samples.reduce((sum, sample) => sum + sample.latencyBuckets.reduce((inner, count) => inner + count, 0), 0);
		const notFoundCount = samples.reduce((sum, sample) => sum + sample.status4xx, 0);

		expect(requestCount).toBe(SUCCESS_COUNT + NOT_FOUND_COUNT);
		expect(histogramCount).toBe(SUCCESS_COUNT + NOT_FOUND_COUNT);
		expect(notFoundCount).toBe(NOT_FOUND_COUNT);
		expect(samples.every((sample) => sample.routeId === routeId && sample.instanceId === instanceId)).toBe(true);

		const logged = (await redis.lrange(REQUEST_LOG_LIST, 0, 99))
			.map((raw) => JSON.parse(raw) as RequestLogEntry)
			.filter((entry) => entry.routeId === routeId);

		expect(logged).toHaveLength(NOT_FOUND_COUNT);
		expect(logged.every((entry) => entry.status === 404 && entry.path === `/${RUN}/missing`)).toBe(true);

		await vi.waitFor(() => expect(events.some((event) => event.type === 'traffic.flushed' && event.routeIds.includes(routeId))).toBe(true));
		expect(await redis.get(heartbeatKey(GATEWAY_ID))).toBeNull();
	});
});
