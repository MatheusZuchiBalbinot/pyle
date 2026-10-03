import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { pipeline } from 'node:stream';

import type { ConsumerConfig, InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';
import type { GatewayErrorCode } from '@pyle/shared/contracts/gateway-error.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { ApiKeyCache } from '../auth/api-key-cache.js';
import { authenticate } from '../auth/authenticate.js';
import type { KeyUsageTracker } from '../auth/key-usage-tracker.js';
import type { ConfigStore } from '../config/config-store.js';
import type { LoadBalancerRegistry } from '../contracts/load-balancer.js';
import type { RequestObserver } from '../contracts/request-observer.js';
import { sendGatewayError } from '../errors/send-gateway-error.js';
import type { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { forwardWithRetry, type ForwardDependencies, type ForwardRequest, type ForwardResult } from '../proxy/forward-with-retry.js';
import {
	buildUpstreamRequest,
	REQUEST_ID_HEADER,
	ROUTE_HEADER,
	toClientResponseHeaders,
	type UpstreamRequest,
	type UpstreamRequestInput,
} from '../proxy/upstream-request.js';
import type { GatewayRateLimiter, RateLimitHeaders } from '../rate-limit/gateway-rate-limiter.js';
import { rewritePath, splitRequestTarget } from '../routing/rewrite-path.js';
import type { RouteMatch } from '../routing/route-table.js';
import { hasRequestBody, resolveClientIp, resolveRequestId } from './request-identity.js';
import { CLIENT_CLOSED_REQUEST_STATUS, RequestTrace } from './request-trace.js';
import { formatTraceparent, resolveTraceContext, TRACEPARENT_HEADER, type TraceContext } from './trace-context.js';

const INSTANCE_HEADER = 'x-pyle-instance';
const ATTEMPTS_HEADER = 'x-pyle-attempts';
const RATE_LIMIT_DEGRADED_LOG_INTERVAL_MS = 60_000;
const FORWARDED_PROTOCOL = 'http';
const DEFAULT_METHOD = 'GET';
const ROOT_URL = '/';

export type RequestHandlerDependencies = {
	readonly store: ConfigStore;
	readonly keys: ApiKeyCache;
	readonly keyUsage: KeyUsageTracker;
	readonly rateLimiter: GatewayRateLimiter;
	readonly balancers: LoadBalancerRegistry;
	readonly forward: ForwardDependencies;
	readonly requestObserver: RequestObserver;
	readonly logger: GatewayLogger;
	readonly maxRequestTimeoutMs: number;
	readonly now: () => number;
	// The rate limiter failed open on this request (Redis unreachable).
	readonly onRateLimitDegraded: () => void;
};

type RequestScope = {
	readonly request: IncomingMessage;
	readonly response: ServerResponse;
	readonly requestId: string;
	readonly trace: RequestTrace;
	readonly traceContext: TraceContext;
	readonly startedAtMs: number;
	readonly path: string;
	readonly query: string;
	readonly clientIp: string;
	readonly abort: AbortController;
};

type Accepted = {
	readonly match: RouteMatch;
	readonly consumer: ConsumerConfig | null;
};

type RelayedResponse = Extract<ForwardResult, { readonly kind: 'response' }>;
type FailedForward = Exclude<ForwardResult, { readonly kind: 'response' }>;

// Every request, rejected or not, ends as one CompletedRequest.
export function createRequestHandler(dependencies: RequestHandlerDependencies): (request: IncomingMessage, response: ServerResponse) => void {
	function observeCompletion(scope: RequestScope): void {
		let isReported = false;

		function report(): void {
			if (isReported) {
				return;
			}

			isReported = true;
			const status = scope.response.writableFinished ? scope.response.statusCode : CLIENT_CLOSED_REQUEST_STATUS;

			dependencies.requestObserver.onRequestCompleted(scope.trace.complete(status, dependencies.now()));
		}

		function handleClose(): void {
			if (!scope.response.writableFinished) {
				scope.abort.abort();
			}

			report();
		}

		scope.response.once('finish', report);
		scope.response.once('close', handleClose);
	}

	function reject(scope: RequestScope, code: GatewayErrorCode, headers: OutgoingHttpHeaders = {}): void {
		scope.trace.recordGatewayError(code);
		sendGatewayError(scope.response, { code, requestId: scope.requestId, headers });
		scope.request.resume();
	}

	// Null when the request was rejected (and already answered).
	async function accept(scope: RequestScope): Promise<Accepted | null> {
		const table = dependencies.store.current();

		if (table === null) {
			reject(scope, 'gateway_not_ready');

			return null;
		}

		const match = table.match(scope.path);

		if (match === null) {
			reject(scope, 'route_not_found');

			return null;
		}

		scope.trace.recordRoute({ routeId: match.route.id, routeName: match.route.name });
		const methods = allowedMethods(match);
		const method = (scope.request.method ?? DEFAULT_METHOD).toUpperCase();
		const isMethodAllowed = methods === null || methods.includes(method);

		if (!isMethodAllowed) {
			reject(scope, 'method_not_allowed', { allow: methods?.join(', ') ?? '' });

			return null;
		}

		const auth = await authenticate({ headers: scope.request.headers, route: match.route, table, keys: dependencies.keys });

		if (auth.kind === 'rejected') {
			reject(scope, auth.error);

			return null;
		}

		if (auth.kind === 'anonymous') {
			return { match, consumer: null };
		}

		scope.trace.recordConsumer({ consumerId: auth.consumer.id, consumerSlug: auth.consumer.slug });
		dependencies.keyUsage.touch(auth.keyId);

		return { match, consumer: auth.consumer };
	}

	// Null when rejected (and already answered); a limiter without Redis lets the request
	// through without headers.
	async function applyRateLimit(scope: RequestScope, accepted: Accepted): Promise<OutgoingHttpHeaders | null> {
		const input = { consumer: accepted.consumer, route: accepted.match.route, clientIp: scope.clientIp, nowMs: dependencies.now() };
		const limit = await dependencies.rateLimiter.check(input);

		if (limit.kind === 'degraded') {
			dependencies.onRateLimitDegraded();
			dependencies.logger.warnThrottled(
				'rate-limit-degraded',
				RATE_LIMIT_DEGRADED_LOG_INTERVAL_MS,
				'Rate limiting unavailable (Redis unreachable); letting requests through',
			);

			return {};
		}

		const limitHeaders = rateLimitHeaders(limit.headers);

		if (limit.kind === 'allowed') {
			return limitHeaders;
		}

		scope.trace.recordGatewayError('rate_limited');
		const headers: OutgoingHttpHeaders = { ...limitHeaders, 'retry-after': String(limit.retryAfterSeconds) };

		sendGatewayError(scope.response, { code: 'rate_limited', requestId: scope.requestId, scope: limit.scope, headers });
		scope.request.resume();

		return null;
	}

	function targetBuilder(scope: RequestScope, accepted: Accepted): (instance: InstanceConfig) => UpstreamRequest {
		const { route } = accepted.match;
		const forwardedPath = rewritePath({ path: scope.path, pathPrefix: route.pathPrefix, stripPrefix: route.stripPrefix });

		return (instance) => {
			const input: UpstreamRequestInput = {
				instanceUrl: instance.url,
				forwardedPath,
				query: scope.query,
				headers: scope.request.headers,
				consumerSlug: accepted.consumer?.slug ?? null,
				routeName: route.name,
				requestId: scope.requestId,
				traceparent: formatTraceparent(scope.traceContext),
				clientIp: scope.clientIp,
				protocol: FORWARDED_PROTOCOL,
				host: scope.request.headers.host,
			};

			return buildUpstreamRequest(input);
		};
	}

	function relay(scope: RequestScope, accepted: Accepted, result: RelayedResponse, limitHeaders: OutgoingHttpHeaders): void {
		const headers: OutgoingHttpHeaders = {
			...toClientResponseHeaders(result.response.headers),
			...limitHeaders,
			[REQUEST_ID_HEADER]: scope.requestId,
			[ROUTE_HEADER]: accepted.match.route.name,
			[INSTANCE_HEADER]: result.instance.name,
			[ATTEMPTS_HEADER]: String(result.attempts),
		};

		scope.response.writeHead(result.response.statusCode ?? 0, headers);
		// A client that leaves aborts the upstream request, so the instance's
		// body errors either way: only an error before the abort is the
		// instance's fault. The status is already sent, so the log is all
		// that is left to say it.
		let isCutByInstance = false;

		result.response.once('error', () => {
			isCutByInstance = !scope.abort.signal.aborted;
		});
		pipeline(result.response, scope.response, (error) => {
			if (!isCutByInstance) {
				return;
			}

			const context = {
				requestId: scope.requestId,
				traceId: scope.traceContext.traceId,
				instance: result.instance.name,
				error: toErrorMessage(error),
			};

			dependencies.logger.warn('Response cut short', context);
		});
	}

	async function forward(scope: RequestScope, accepted: Accepted, limitHeaders: OutgoingHttpHeaders): Promise<void> {
		const { route, service } = accepted.match;
		const perAttemptTimeoutMs = route.timeoutMs ?? service.timeoutMs;
		const budgetMs = Math.min(perAttemptTimeoutMs * service.retryMaxAttempts, dependencies.maxRequestTimeoutMs);
		const hasBody = hasRequestBody(scope.request);
		const forwardRequest: ForwardRequest = {
			service,
			balancer: dependencies.balancers.forService(service),
			method: scope.request.method ?? DEFAULT_METHOD,
			body: hasBody ? scope.request : null,
			buildTarget: targetBuilder(scope, accepted),
			perAttemptTimeoutMs,
			deadlineMs: scope.startedAtMs + budgetMs,
			signal: scope.abort.signal,
		};

		if (!hasBody) {
			scope.request.resume();
		}

		const result = await forwardWithRetry(forwardRequest, dependencies.forward);

		scope.trace.recordAttempts(result.attempts, instanceFacts(result));

		if (result.kind === 'response') {
			relay(scope, accepted, result, limitHeaders);

			return;
		}

		const code = gatewayErrorFor(result);

		if (code === null) {
			scope.response.destroy();

			return;
		}

		scope.trace.recordGatewayError(code);
		const headers: OutgoingHttpHeaders = { ...limitHeaders, [ROUTE_HEADER]: route.name };

		sendGatewayError(scope.response, { code, requestId: scope.requestId, headers });
	}

	async function handle(scope: RequestScope): Promise<void> {
		const accepted = await accept(scope);

		if (accepted === null) {
			return;
		}

		const limitHeaders = await applyRateLimit(scope, accepted);

		if (limitHeaders === null) {
			return;
		}

		await forward(scope, accepted, limitHeaders);
	}

	return (request, response) => {
		const startedAtMs = dependencies.now();
		const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
		const traceContext = resolveTraceContext(request.headers[TRACEPARENT_HEADER]);
		const { path, query } = splitRequestTarget(request.url ?? ROOT_URL);
		const trace = new RequestTrace({ requestId, startedAtMs, method: request.method ?? DEFAULT_METHOD, path });
		const clientIp = resolveClientIp(request);
		const scope: RequestScope = {
			request,
			response,
			requestId,
			trace,
			traceContext,
			startedAtMs,
			path,
			query,
			clientIp,
			abort: new AbortController(),
		};

		response.setHeader(REQUEST_ID_HEADER, requestId);
		observeCompletion(scope);
		handle(scope).catch((error: unknown) => {
			dependencies.logger.error('Request failed inside the gateway', { requestId, traceId: traceContext.traceId, error: toErrorMessage(error) });
			reject(scope, 'internal_error');
		});
	};
}

function rateLimitHeaders(headers: RateLimitHeaders | null): OutgoingHttpHeaders {
	if (headers === null) {
		return {};
	}

	return {
		'x-ratelimit-limit': String(headers.limit),
		'x-ratelimit-remaining': String(headers.remaining),
		'x-ratelimit-reset': String(headers.resetAtSeconds),
	};
}

// The route's methods, or null when it accepts every method.
function allowedMethods(match: RouteMatch): readonly string[] | null {
	if (match.route.methods.length === 0) {
		return null;
	}

	return match.route.methods;
}

// Null for a client that went away: there is no one to answer.
function gatewayErrorFor(result: FailedForward): GatewayErrorCode | null {
	if (result.kind === 'no_instance') {
		return 'no_healthy_instance';
	}

	if (result.outcome.kind === 'timeout') {
		return 'upstream_timeout';
	}

	if (result.outcome.kind === 'connection_error') {
		return 'upstream_unreachable';
	}

	return null;
}

function instanceFacts(result: ForwardResult): { readonly instanceId: string; readonly instanceName: string } | null {
	if (result.kind === 'no_instance') {
		return null;
	}

	return { instanceId: result.instance.id, instanceName: result.instance.name };
}
