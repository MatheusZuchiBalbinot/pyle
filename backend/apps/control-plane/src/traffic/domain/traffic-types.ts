export type TrafficWindowRange = {
	readonly from: string;
	readonly to: string;
	readonly stepSeconds: number;
};

export type TrafficTotals = {
	readonly requestCount: number;
	readonly requestsPerSecond: number;
	// 5xx / total, 0..1.
	readonly errorRate: number;
	// 4xx excluding the gateway's 429 / total.
	readonly clientErrorRate: number;
	readonly rateLimitedCount: number;
	readonly p50Ms: number | null;
	readonly p95Ms: number | null;
	readonly p99Ms: number | null;
	readonly retryCount: number;
};

export type TrafficPoint = {
	// Step start.
	readonly at: string;
	readonly requestsPerSecond: number;
	readonly errorRate: number;
	readonly rateLimitedCount: number;
	readonly p50Ms: number | null;
	readonly p95Ms: number | null;
	readonly p99Ms: number | null;
};

// The counters every aggregated sample row carries. Consumer samples have
// no 2xx/3xx split, gateway errors or retries: those read as 0.
export type SampleCounts = {
	readonly requestCount: number;
	readonly status2xx: number;
	readonly status3xx: number;
	readonly status4xx: number;
	readonly status5xx: number;
	readonly rateLimitedCount: number;
	readonly gatewayErrorCount: number;
	readonly retryCount: number;
	readonly latencyBuckets: readonly number[];
};

export type SampleRow = SampleCounts & {
	// Step start; null when not grouped by time.
	readonly at: Date | null;
	// Route, instance or consumer id per the query's grouping; null for
	// "no route", "no instance", "anonymous", or an ungrouped query.
	readonly key: string | null;
};
