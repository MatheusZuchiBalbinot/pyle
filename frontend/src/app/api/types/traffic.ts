import type { Consumer } from './consumers';
import type { Route } from './routes';
import type { Service } from './services';

export type TrafficWindowName = '15m' | '1h' | '6h' | '24h';

export type TrafficWindowQuery = { readonly window: TrafficWindowName } | { readonly from: string; readonly to: string };

export type TrafficWindow = {
	readonly from: string;
	readonly to: string;
	readonly stepSeconds: number;
};

export type TrafficTotals = {
	readonly requestCount: number;
	readonly requestsPerSecond: number;
	// 5xx / total, 0..1.
	readonly errorRate: number;
	// 4xx excluding 429 / total.
	readonly clientErrorRate: number;
	readonly rateLimitedCount: number;
	readonly p50Ms: number | null;
	readonly p95Ms: number | null;
	readonly p99Ms: number | null;
	readonly retryCount: number;
};

export type TrafficPoint = {
	// Bucket start.
	readonly at: string;
	readonly requestsPerSecond: number;
	readonly errorRate: number;
	readonly rateLimitedCount: number;
	readonly p50Ms: number | null;
	readonly p95Ms: number | null;
	readonly p99Ms: number | null;
};

export type RouteTrafficSummary = {
	readonly routeId: string;
	readonly name: string;
	readonly pathPrefix: string;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
};

export type TopConsumer = {
	// Null = unauthenticated traffic.
	readonly consumerId: string | null;
	readonly slug: string | null;
	readonly name: string | null;
	readonly requestCount: number;
	readonly rateLimitedCount: number;
};

export type TrafficOverview = {
	readonly window: TrafficWindow;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
	readonly routes: readonly RouteTrafficSummary[];
	readonly topConsumers: readonly TopConsumer[];
};

export type InstanceTraffic = {
	readonly instanceId: string;
	readonly name: string;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
	// Fraction of the route's (or service's) requests this instance served.
	readonly share: number;
};

export type StatusBreakdown = {
	readonly status2xx: number;
	readonly status3xx: number;
	readonly status4xx: number;
	readonly status5xx: number;
	readonly rateLimited: number;
	readonly gatewayErrors: number;
};

export type RouteTraffic = {
	readonly route: Route;
	readonly window: TrafficWindow;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
	readonly instances: readonly InstanceTraffic[];
	readonly statusBreakdown: StatusBreakdown;
};

export type ServiceTraffic = {
	readonly service: Service;
	readonly window: TrafficWindow;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
	readonly instances: readonly InstanceTraffic[];
};

export type ConsumerRouteUsage = {
	readonly routeId: string | null;
	readonly name: string | null;
	readonly requestCount: number;
	readonly rateLimitedCount: number;
};

export type ConsumerTraffic = {
	readonly consumer: Consumer;
	readonly window: TrafficWindow;
	readonly totals: TrafficTotals;
	readonly series: readonly TrafficPoint[];
	readonly routes: readonly ConsumerRouteUsage[];
};

export type GatewayErrorCode =
	| 'route_not_found'
	| 'method_not_allowed'
	| 'missing_api_key'
	| 'invalid_api_key'
	| 'route_not_allowed'
	| 'rate_limited'
	| 'no_healthy_instance'
	| 'upstream_unreachable'
	| 'upstream_timeout'
	| 'gateway_not_ready'
	| 'internal_error';

export type RequestLogEntry = {
	readonly requestId: string;
	readonly at: string;
	readonly method: string;
	readonly path: string;
	readonly routeId: string | null;
	readonly routeName: string | null;
	readonly consumerId: string | null;
	readonly consumerSlug: string | null;
	readonly instanceId: string | null;
	readonly instanceName: string | null;
	readonly status: number;
	readonly durationMs: number;
	readonly attempts: number;
	readonly gatewayError: GatewayErrorCode | null;
};

export type StatusClass = '2xx' | '3xx' | '4xx' | '5xx';

export type RequestLogFilter = {
	readonly routeId?: string;
	readonly consumerId?: string;
	readonly instanceId?: string;
	readonly statusClass?: StatusClass;
};

export type GatewayHeartbeat = {
	readonly gatewayId: string;
	readonly startedAt: string;
	readonly configVersion: number;
	readonly isRateLimitDegraded: boolean;
	readonly updatedAt: string;
};

export type GatewayStatus = {
	readonly gateways: readonly (GatewayHeartbeat & { readonly isAlive: boolean })[];
	readonly configVersion: number;
};
