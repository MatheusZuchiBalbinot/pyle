import type {
	ChaosState,
	GatewayAlert,
	InstanceLiveState,
	Route,
	Service,
	ServiceInstance,
	SystemHealthComponentStatus,
	TrafficPoint,
	TrafficTotals,
} from '../app/api/adminApiTypes';

const AT = '2026-09-25T10:00:00.000Z';

export function buildLiveState(overrides: Partial<InstanceLiveState> = {}): InstanceLiveState {
	return {
		instanceId: 'i1',
		gatewayId: 'gw-test',
		health: 'healthy',
		circuit: 'closed',
		inFlight: 0,
		consecutiveFailures: 0,
		lastCheckAt: AT,
		lastCheckLatencyMs: 3,
		updatedAt: AT,
		...overrides,
	};
}

export function buildInstance(name: string, overrides: Partial<ServiceInstance> = {}): ServiceInstance {
	const id = `id-${name}`;

	return {
		id,
		serviceId: 's1',
		name,
		url: `http://localhost:48101/${name}`,
		weight: 1,
		isEnabled: true,
		source: 'static',
		scalingState: null,
		live: buildLiveState({ instanceId: id }),
		chaos: null,
		createdAt: AT,
		updatedAt: AT,
		...overrides,
	};
}

export function buildService(slug: string, overrides: Partial<Service> = {}): Service {
	return {
		id: `id-${slug}`,
		slug,
		name: slug.toUpperCase(),
		description: null,
		lbStrategy: 'round_robin',
		timeoutMs: 10_000,
		retryMaxAttempts: 2,
		healthCheck: { path: '/health', intervalMs: 5000, timeoutMs: 2000, healthyThreshold: 2, unhealthyThreshold: 3 },
		circuit: { failureThreshold: 5, cooldownMs: 15_000 },
		scaling: { profile: null, desiredManagedReplicas: 0 },
		instances: [buildInstance(`${slug}-1`)],
		routeCount: 1,
		createdAt: AT,
		updatedAt: AT,
		...overrides,
	};
}

export function buildRoute(pathPrefix: string, overrides: Partial<Route> = {}): Route {
	return {
		id: `id-${pathPrefix}`,
		name: pathPrefix,
		pathPrefix,
		service: { id: 'id-orders', slug: 'orders', name: 'Pedidos' },
		stripPrefix: true,
		methods: [],
		isAuthRequired: true,
		rateLimitPerMinute: null,
		timeoutMs: null,
		createdAt: AT,
		updatedAt: AT,
		...overrides,
	};
}

export function buildGatewayAlert(overrides: Partial<GatewayAlert> = {}): GatewayAlert {
	return {
		id: 'a1',
		kind: 'route_p95_latency',
		severity: 'warning',
		subjectType: 'route',
		subjectId: 'r1',
		subjectName: 'Pedidos',
		message: 'p95 1200 ms',
		triggeredAt: AT,
		resolvedAt: null,
		...overrides,
	};
}

export function buildComponent(overrides: Partial<SystemHealthComponentStatus> = {}): SystemHealthComponentStatus {
	return { component: 'gateway', status: 'up', detail: null, ...overrides };
}

export function buildTrafficTotals(overrides: Partial<TrafficTotals> = {}): TrafficTotals {
	return {
		requestCount: 600,
		requestsPerSecond: 10,
		errorRate: 0,
		clientErrorRate: 0,
		rateLimitedCount: 0,
		p50Ms: 20,
		p95Ms: 80,
		p99Ms: 120,
		retryCount: 0,
		...overrides,
	};
}

export function buildTrafficPoint(at: string, overrides: Partial<TrafficPoint> = {}): TrafficPoint {
	return { at, requestsPerSecond: 10, errorRate: 0, rateLimitedCount: 0, p50Ms: 20, p95Ms: 80, p99Ms: 120, ...overrides };
}

export const NO_CHAOS: ChaosState = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };
