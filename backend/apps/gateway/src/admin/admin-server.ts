import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

import { TIMED_OUT, withTimeout } from '@pyle/shared/utils/with-timeout.js';

const DEPENDENCY_CHECK_TIMEOUT_MS = 1000;
const HEALTH_PATH = '/health';
const READY_PATH = '/health/ready';
const METRICS_PATH = '/metrics';
// The Prometheus text exposition format.
const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

export type AdminServerOptions = {
	readonly gatewayId: string;
	readonly startedAtMs: number;
	readonly now: () => number;
	readonly configVersion: () => number | null;
	readonly pingRedis: () => Promise<unknown>;
	readonly pingPostgres: () => Promise<unknown>;
	readonly renderMetrics: () => string;
};

type CheckStatus = 'up' | 'down';

// degraded: serving from the last snapshot while Redis (rate limits fail open) or Postgres
// (no reloads, no samples) is away. Still ready: pulling every gateway out of a load
// balancer during a database outage is the failure the separate data plane exists to avoid.
type ReadinessStatus = 'ready' | 'degraded' | 'not_ready';

type ReadinessChecks = { readonly config: CheckStatus; readonly redis: CheckStatus; readonly postgres: CheckStatus };

const MS_PER_SECOND = 1000;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const HTTP_SERVICE_UNAVAILABLE = 503;

// Liveness never touches a dependency (an outage must not restart the process); readiness
// says whether this gateway can serve now, which only needs a loaded configuration.
export function createAdminServer(options: AdminServerOptions): Server {
	async function handleReady(response: ServerResponse): Promise<void> {
		const version = options.configVersion();
		const [redis, postgres] = await Promise.all([check(options.pingRedis), check(options.pingPostgres)]);
		const checks: ReadinessChecks = { config: version === null ? 'down' : 'up', redis, postgres };
		const status = resolveReadiness(checks);
		const httpStatus = status === 'not_ready' ? HTTP_SERVICE_UNAVAILABLE : HTTP_OK;

		sendJson(response, httpStatus, { status, configVersion: version, checks });
	}

	function handle(request: IncomingMessage, response: ServerResponse): void {
		if (request.url === HEALTH_PATH) {
			const uptimeSeconds = Math.floor((options.now() - options.startedAtMs) / MS_PER_SECOND);

			return sendJson(response, HTTP_OK, { status: 'ok', gatewayId: options.gatewayId, uptimeSeconds });
		}

		if (request.url === READY_PATH) {
			return void handleReady(response);
		}

		if (request.url === METRICS_PATH) {
			response.writeHead(HTTP_OK, { 'content-type': METRICS_CONTENT_TYPE });

			return void response.end(options.renderMetrics());
		}

		return sendJson(response, HTTP_NOT_FOUND, { error: 'not_found' });
	}

	return createServer(handle);
}

export function resolveReadiness(checks: ReadinessChecks): ReadinessStatus {
	if (checks.config === 'down') {
		return 'not_ready';
	}

	const isEveryDependencyUp = checks.redis === 'up' && checks.postgres === 'up';

	if (!isEveryDependencyUp) {
		return 'degraded';
	}

	return 'ready';
}

async function check(probe: () => Promise<unknown>): Promise<CheckStatus> {
	try {
		const result = await withTimeout(probe(), DEPENDENCY_CHECK_TIMEOUT_MS);

		return result === TIMED_OUT ? 'down' : 'up';
	} catch {
		return 'down';
	}
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
	response.writeHead(status, { 'content-type': 'application/json' });
	response.end(JSON.stringify(body));
}
