import { hostname } from 'node:os';

import { TRAFFIC_BUCKET_MS } from '../contracts/latency-histogram.js';
import { readFractionEnv, readPortEnv, readPositiveIntEnv, readRequiredEnv } from './env-parsing.js';

const DEFAULT_GATEWAY_PORT = 8080;
const DEFAULT_GATEWAY_ADMIN_PORT = 8090;
const DEFAULT_CONFIG_REFRESH_MS = 30_000;
const MIN_CONFIG_REFRESH_MS = 1000;
const DEFAULT_HEARTBEAT_MS = 5000;
const DEFAULT_MAX_REQUEST_TIMEOUT_MS = 60_000;
const DEFAULT_REQUEST_LOG_MAX_ENTRIES = 1000;
const DEFAULT_REQUEST_LOG_SUCCESS_SAMPLE_RATE = 0.2;

export type GatewayConfig = {
	readonly gatewayId: string;
	readonly port: number;
	readonly adminPort: number;
	readonly databaseUrl: string;
	readonly redisUrl: string;
	readonly configRefreshMs: number;
	readonly metricsFlushMs: number;
	readonly heartbeatMs: number;
	readonly maxRequestTimeoutMs: number;
	readonly requestLogMaxEntries: number;
	readonly requestLogSuccessSampleRate: number;
};

export function readGatewayConfig(): GatewayConfig {
	return {
		gatewayId: process.env.GATEWAY_ID || defaultGatewayId(),
		port: readPortEnv('GATEWAY_PORT', DEFAULT_GATEWAY_PORT),
		adminPort: readPortEnv('GATEWAY_ADMIN_PORT', DEFAULT_GATEWAY_ADMIN_PORT),
		databaseUrl: readRequiredEnv('CONTROL_PLANE_DATABASE_URL'),
		redisUrl: readRequiredEnv('CONTROL_PLANE_REDIS_URL'),
		configRefreshMs: readConfigRefreshMs(),
		metricsFlushMs: readMetricsFlushMs(),
		heartbeatMs: readPositiveIntEnv('GATEWAY_HEARTBEAT_MS', DEFAULT_HEARTBEAT_MS),
		maxRequestTimeoutMs: readPositiveIntEnv('GATEWAY_MAX_REQUEST_TIMEOUT_MS', DEFAULT_MAX_REQUEST_TIMEOUT_MS),
		requestLogMaxEntries: readPositiveIntEnv('REQUEST_LOG_MAX_ENTRIES', DEFAULT_REQUEST_LOG_MAX_ENTRIES),
		requestLogSuccessSampleRate: readFractionEnv('REQUEST_LOG_SUCCESS_SAMPLE_RATE', DEFAULT_REQUEST_LOG_SUCCESS_SAMPLE_RATE),
	};
}

function defaultGatewayId(): string {
	return `gw-${hostname()}-${process.pid}`;
}

function readConfigRefreshMs(): number {
	const refreshMs = readPositiveIntEnv('GATEWAY_CONFIG_REFRESH_MS', DEFAULT_CONFIG_REFRESH_MS);

	if (refreshMs < MIN_CONFIG_REFRESH_MS) {
		throw new Error(`GATEWAY_CONFIG_REFRESH_MS must be at least ${MIN_CONFIG_REFRESH_MS} (got ${refreshMs})`);
	}

	return refreshMs;
}

// The flush interval is the traffic bucket size: samples are keyed by
// bucket, so flushing at any other pace would split or merge buckets.
function readMetricsFlushMs(): number {
	const flushMs = readPositiveIntEnv('GATEWAY_METRICS_FLUSH_MS', TRAFFIC_BUCKET_MS);

	if (flushMs !== TRAFFIC_BUCKET_MS) {
		throw new Error(`GATEWAY_METRICS_FLUSH_MS must equal the traffic bucket size (${TRAFFIC_BUCKET_MS}, got ${flushMs})`);
	}

	return flushMs;
}
