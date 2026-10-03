import type { ConsumerDto, RouteDto, ServiceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';

type Instance = ServiceDto['instances'][number];

export function buildService(overrides: Partial<ServiceDto> = {}): ServiceDto {
	const base: ServiceDto = {
		id: 'svc',
		slug: 'orders',
		name: 'Pedidos',
		description: null,
		lbStrategy: 'weighted_random',
		timeoutMs: 3000,
		retryMaxAttempts: 2,
		healthCheck: { path: '/health', intervalMs: 5000, timeoutMs: 1000, healthyThreshold: 2, unhealthyThreshold: 3 },
		circuit: { failureThreshold: 5, cooldownMs: 10_000 },
		scaling: { profile: null, desiredManagedReplicas: 0 },
		instances: [buildInstance('orders-1'), buildInstance('orders-2', { isEnabled: false })],
		routeCount: 1,
		createdAt: '',
		updatedAt: '',
	};

	return { ...base, ...overrides };
}

export function buildRoute(overrides: Partial<RouteDto> = {}): RouteDto {
	const base: RouteDto = {
		id: 'route-orders',
		name: 'orders-api',
		pathPrefix: '/api/orders',
		service: { id: 'svc', slug: 'orders', name: 'Pedidos' },
		stripPrefix: true,
		methods: [],
		isAuthRequired: true,
		rateLimitPerMinute: null,
		timeoutMs: null,
		createdAt: '',
		updatedAt: '',
	};

	return { ...base, ...overrides };
}

export function buildConsumer(overrides: Partial<ConsumerDto> = {}): ConsumerDto {
	const activeKey = { id: 'key-1', keyPrefix: 'pyle_ab12', label: null, createdAt: '', lastUsedAt: null, revokedAt: null };
	const revokedKey = { ...activeKey, id: 'key-0', keyPrefix: 'pyle_old0', revokedAt: '2026-01-01T00:00:00Z' };
	const base: ConsumerDto = {
		id: 'c1',
		slug: 'web-app',
		name: 'Web App',
		rateLimitPerMinute: 600,
		allowedRoutes: [],
		apiKeys: [activeKey, revokedKey],
		createdAt: '',
		updatedAt: '',
	};

	return { ...base, ...overrides };
}

function buildInstance(name: string, overrides: Partial<Instance> = {}): Instance {
	return {
		id: `id-${name}`,
		serviceId: 'svc',
		name,
		url: 'http://x',
		weight: 50,
		isEnabled: true,
		source: 'static',
		scalingState: null,
		live: null,
		chaos: null,
		createdAt: '',
		updatedAt: '',
		...overrides,
	};
}
