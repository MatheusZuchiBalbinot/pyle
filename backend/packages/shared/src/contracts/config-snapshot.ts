// Plain literal types on purpose: the data plane must not depend on the Prisma client's
// types.
export const HTTP_METHOD_NAMES = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;
export type HttpMethodName = (typeof HTTP_METHOD_NAMES)[number];

export const LOAD_BALANCING_STRATEGY_NAMES = ['round_robin', 'least_connections', 'weighted_random'] as const;
export type LoadBalancingStrategyName = (typeof LOAD_BALANCING_STRATEGY_NAMES)[number];

export type InstanceConfig = {
	readonly id: string;
	readonly serviceId: string;
	readonly name: string;
	readonly url: string;
	readonly weight: number;
	readonly isEnabled: boolean;
};

export type HealthCheckConfig = {
	readonly path: string;
	readonly intervalMs: number;
	readonly timeoutMs: number;
	readonly healthyThreshold: number;
	readonly unhealthyThreshold: number;
};

export type CircuitConfig = {
	readonly failureThreshold: number;
	readonly cooldownMs: number;
};

export type ServiceConfig = {
	readonly id: string;
	readonly slug: string;
	readonly lbStrategy: LoadBalancingStrategyName;
	readonly timeoutMs: number;
	readonly retryMaxAttempts: number;
	readonly healthCheck: HealthCheckConfig;
	readonly circuit: CircuitConfig;
	readonly instances: readonly InstanceConfig[];
};

export type RouteConfig = {
	readonly id: string;
	readonly name: string;
	readonly pathPrefix: string;
	readonly serviceId: string;
	readonly stripPrefix: boolean;
	// Empty = every method.
	readonly methods: readonly HttpMethodName[];
	readonly isAuthRequired: boolean;
	readonly rateLimitPerMinute: number | null;
	readonly timeoutMs: number | null;
};

export type ConsumerConfig = {
	readonly id: string;
	readonly slug: string;
	readonly rateLimitPerMinute: number;
	// Empty = every route.
	readonly allowedRouteIds: readonly string[];
};

// API keys are not in the snapshot: the data plane resolves them by hash.
export type GatewayConfigSnapshot = {
	// Epoch ms of the newest updatedAt among the rows loaded.
	readonly version: number;
	readonly loadedAt: number;
	readonly services: readonly ServiceConfig[];
	readonly routes: readonly RouteConfig[];
	readonly consumers: readonly ConsumerConfig[];
};
