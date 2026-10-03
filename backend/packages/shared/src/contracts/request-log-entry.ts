import type { GatewayErrorCode } from './gateway-error.js';

export type RequestLogEntry = {
	readonly requestId: string;
	readonly at: string;
	readonly method: string;
	// Original path, query string removed.
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
