import type { PrismaClient } from '@prisma/control-plane-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { GatewayConfig } from '@pyle/shared/config/gateway.js';
import { hashApiKey } from '@pyle/shared/contracts/api-key.js';
import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';
import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { GatewayLogger } from './infrastructure/gateway-logger.js';
import type { GatewayRedis } from './infrastructure/gateway-redis.js';
import { startFakeUpstream, type FakeUpstream } from './testing/fake-upstream.js';
import { GatewayApp, INITIAL_LOAD_ATTEMPTS, type GatewayContext, type GatewayLifecycleHook } from './gateway-app.js';

const API_KEY = 'pyle_live_gateway_app_spec';
const UPDATED_AT = new Date('2026-09-26T10:00:00.000Z');

const CONFIG: GatewayConfig = {
	gatewayId: 'gw-spec',
	port: 0,
	adminPort: 0,
	databaseUrl: 'postgresql://unused',
	redisUrl: 'redis://unused',
	configRefreshMs: 60_000,
	metricsFlushMs: 10_000,
	heartbeatMs: 5000,
	maxRequestTimeoutMs: 5000,
	requestLogMaxEntries: 100,
	requestLogSuccessSampleRate: 1,
};

type MessageListener = (channel: string, message: string) => void;

function buildRows(upstreamUrl: string) {
	const service = {
		id: 's1',
		slug: 'orders',
		lbStrategy: 'round_robin',
		timeoutMs: 1000,
		retryMaxAttempts: 1,
		healthCheckPath: '/health',
		healthCheckIntervalMs: 5000,
		healthCheckTimeoutMs: 2000,
		healthyThreshold: 2,
		unhealthyThreshold: 3,
		circuitFailureThreshold: 5,
		circuitCooldownMs: 15_000,
		updatedAt: UPDATED_AT,
		instances: [{ id: 'i1', serviceId: 's1', name: 'orders-1', url: upstreamUrl, weight: 1, isEnabled: true, updatedAt: UPDATED_AT }],
	};
	const route = {
		id: 'r1',
		name: 'Pedidos',
		pathPrefix: '/api/orders',
		serviceId: 's1',
		stripPrefix: true,
		methods: [],
		isAuthRequired: true,
		rateLimitPerMinute: null,
		timeoutMs: null,
		updatedAt: UPDATED_AT,
	};
	const consumer = { id: 'c1', slug: 'web', rateLimitPerMinute: 600, updatedAt: UPDATED_AT, routeAccess: [] };

	return { service, route, consumer };
}

function buildFakes(upstreamUrl: string) {
	const rows = buildRows(upstreamUrl);
	const listeners = new Set<MessageListener>();
	const prisma = {
		service: { findMany: vi.fn().mockResolvedValue([rows.service]) },
		route: { findMany: vi.fn().mockResolvedValue([rows.route]) },
		consumer: { findMany: vi.fn().mockResolvedValue([rows.consumer]) },
		apiKey: {
			findFirst: vi.fn(async ({ where }: { readonly where: { readonly keyHash: string } }) =>
				where.keyHash === hashApiKey(API_KEY) ? { id: 'k1', consumerId: 'c1' } : null,
			),
			updateMany: vi.fn().mockRejectedValue(new Error('db busy')),
		},
		$queryRaw: vi.fn().mockResolvedValue([1]),
		$disconnect: vi.fn().mockResolvedValue(undefined),
	};
	const subscriber = {
		connect: vi.fn().mockResolvedValue(undefined),
		subscribe: vi.fn().mockResolvedValue(1),
		unsubscribe: vi.fn().mockResolvedValue(1),
		on: vi.fn((_event: string, listener: MessageListener) => listeners.add(listener)),
		off: vi.fn((_event: string, listener: MessageListener) => listeners.delete(listener)),
		quit: vi.fn().mockResolvedValue('OK'),
	};
	const commands = {
		connect: vi.fn().mockResolvedValue(undefined),
		ping: vi.fn().mockResolvedValue('PONG'),
		quit: vi.fn().mockResolvedValue('OK'),
		// Redis is "down" for the rate limiter: it must fail open.
		eval: vi.fn().mockRejectedValue(new Error('redis down')),
	};
	const redis = { commands, subscriber } as unknown as GatewayRedis;
	const publish = (message: string) => listeners.forEach((listener) => listener(CONFIG_CHANGED_CHANNEL, message));

	return { prisma, redis, publish };
}

describe('GatewayApp', () => {
	let upstream: FakeUpstream | null = null;
	let app: GatewayApp | null = null;

	afterEach(async () => {
		await app?.stop();
		await upstream?.close();
		app = null;
		upstream = null;
	});

	async function boot(options: { readonly prismaOverrides?: (prisma: ReturnType<typeof buildFakes>['prisma']) => void } = {}) {
		upstream = await startFakeUpstream('orders-1');
		const fakes = buildFakes(upstream.url);

		options.prismaOverrides?.(fakes.prisma);
		const lines: string[] = [];
		const events: GatewayEvent[] = [];
		const hook: Required<GatewayLifecycleHook> = { start: vi.fn(), onConfigApplied: vi.fn(), stop: vi.fn() };
		let context: GatewayContext | null = null;
		const logger = new GatewayLogger(CONFIG.gatewayId, (line) => lines.push(line));

		const extension = (received: GatewayContext) => {
			context = received;

			return { hooks: [hook], eventSink: { emit: (event: GatewayEvent) => events.push(event) } };
		};

		const prisma = fakes.prisma as unknown as PrismaClient;

		app = new GatewayApp({ config: CONFIG, logger, redis: fakes.redis, prisma, extensions: [extension], sleep: async () => undefined });

		return { ...fakes, lines, events, hook, context: () => context as unknown as GatewayContext, app };
	}

	function call(port: number | null, key: string): Promise<Response> {
		return fetch(`http://127.0.0.1:${port}/api/orders`, { headers: { authorization: `Bearer ${key}` } });
	}

	it('runs the extension hooks around its lifetime and announces itself', async () => {
		const { hook, events, context } = await boot();

		await app?.start();

		expect(hook.start).toHaveBeenCalledTimes(1);
		expect(hook.onConfigApplied).toHaveBeenCalledTimes(1);
		expect(events.map((event) => event.type)).toEqual(['gateway.config.applied', 'gateway.started']);
		expect(context().currentConfigVersion()).toBe(UPDATED_AT.getTime());
		const ready = await fetch(`http://127.0.0.1:${app?.ports.admin}/health/ready`);

		expect(ready.status).toBe(200);

		await app?.stop();
		expect(hook.stop).toHaveBeenCalledTimes(1);
		app = null;
	});

	it('serves through a Redis outage, flags it and tolerates a failing key usage write', async () => {
		const { context, lines } = await boot();

		await app?.start();
		expect(context().isRateLimitDegraded()).toBe(false);

		const response = await call(app?.ports.traffic ?? null, API_KEY);

		expect(response.status).toBe(200);
		expect(context().isRateLimitDegraded()).toBe(true);
		await vi.waitFor(() => expect(lines.some((line) => line.includes('Could not record API key usage'))).toBe(true));
	});

	it('forgets cached keys when a key changes', async () => {
		const { prisma, publish } = await boot();

		await app?.start();
		await call(app?.ports.traffic ?? null, API_KEY);
		prisma.apiKey.findFirst.mockResolvedValue(null);

		publish(JSON.stringify({ entity: 'service', id: 's1', action: 'updated' }));
		expect((await call(app?.ports.traffic ?? null, API_KEY)).status).toBe(200);
		publish(JSON.stringify({ entity: 'api_key', id: 'k1', action: 'deleted' }));

		expect((await call(app?.ports.traffic ?? null, API_KEY)).status).toBe(401);
	});

	it('waits for the database at boot', async () => {
		const { lines } = await boot({ prismaOverrides: (prisma) => prisma.service.findMany.mockRejectedValueOnce(new Error('starting up')) });

		await app?.start();

		expect(lines.some((line) => line.includes('Configuration not loaded yet'))).toBe(true);
		expect(app?.ports.traffic).toBeGreaterThan(0);
	});

	it('gives up after the last boot attempt', async () => {
		await boot({ prismaOverrides: (prisma) => prisma.service.findMany.mockRejectedValue(new Error('gone')) });

		await expect(app?.start()).rejects.toThrow(`after ${INITIAL_LOAD_ATTEMPTS} attempts`);
		app = null;
	});
});
