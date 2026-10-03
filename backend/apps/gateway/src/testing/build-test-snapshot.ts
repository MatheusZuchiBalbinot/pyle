import type { ConsumerConfig, GatewayConfigSnapshot, InstanceConfig, RouteConfig, ServiceConfig } from '@pyle/shared/contracts/config-snapshot.js';

export const TEST_SERVICE: ServiceConfig = {
	id: 'svc-orders',
	slug: 'orders',
	lbStrategy: 'round_robin',
	timeoutMs: 1000,
	retryMaxAttempts: 2,
	healthCheck: { path: '/health', intervalMs: 5000, timeoutMs: 2000, healthyThreshold: 2, unhealthyThreshold: 3 },
	circuit: { failureThreshold: 5, cooldownMs: 15_000 },
	instances: [],
};

export const TEST_CONSUMER: ConsumerConfig = { id: 'consumer-web', slug: 'web-app', rateLimitPerMinute: 600, allowedRouteIds: [] };

type TestSnapshotInput = {
	readonly routes?: readonly (Partial<RouteConfig> & Pick<RouteConfig, 'id' | 'pathPrefix'>)[];
	readonly instances?: readonly InstanceConfig[];
	readonly service?: Partial<ServiceConfig>;
	readonly consumers?: readonly ConsumerConfig[];
};

export function buildInstance(name: string, overrides: Partial<InstanceConfig> = {}): InstanceConfig {
	return { id: `id-${name}`, serviceId: TEST_SERVICE.id, name, url: `http://127.0.0.1:1/${name}`, weight: 1, isEnabled: true, ...overrides };
}

export function buildRoute(overrides: Partial<RouteConfig> & Pick<RouteConfig, 'id' | 'pathPrefix'>): RouteConfig {
	return {
		name: overrides.id,
		serviceId: TEST_SERVICE.id,
		stripPrefix: true,
		methods: [],
		isAuthRequired: true,
		rateLimitPerMinute: null,
		timeoutMs: null,
		...overrides,
	};
}

export function buildTestSnapshot(input: TestSnapshotInput = {}): GatewayConfigSnapshot {
	const service: ServiceConfig = { ...TEST_SERVICE, instances: input.instances ?? [buildInstance('orders-1')], ...input.service };

	return {
		version: 1,
		loadedAt: 0,
		services: [service],
		routes: (input.routes ?? [{ id: 'orders', pathPrefix: '/api/orders' }]).map(buildRoute),
		consumers: input.consumers ?? [TEST_CONSUMER],
	};
}
