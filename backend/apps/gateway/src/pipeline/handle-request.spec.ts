import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { hashApiKey } from '@pyle/shared/contracts/api-key.js';

import { ApiKeyCache } from '../auth/api-key-cache.js';
import { KeyUsageTracker } from '../auth/key-usage-tracker.js';
import { PerServiceLoadBalancerRegistry, roundRobinForEveryStrategy } from '../balancing/load-balancer-registry.js';
import { ConfigStore } from '../config/config-store.js';
import { NoopAttemptObserver } from '../contracts/attempt-observer.js';
import { AlwaysAvailable } from '../contracts/instance-availability.js';
import type { CompletedRequest } from '../contracts/request-observer.js';
import { NoRetryPolicy } from '../contracts/retry-policy.js';
import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { UpstreamAgents } from '../proxy/upstream-agents.js';
import { sendAttempt } from '../proxy/upstream-attempt.js';
import type { GatewayRateLimiter, RateLimitDecision } from '../rate-limit/gateway-rate-limiter.js';
import { buildInstance, buildTestSnapshot, TEST_CONSUMER } from '../testing/build-test-snapshot.js';
import { startFakeUpstream, type FakeUpstream } from '../testing/fake-upstream.js';
import { createRequestHandler, type RequestHandlerDependencies } from './handle-request.js';

const API_KEY = 'pyle_live_handle_request_spec';
const TIMEOUT_MS = 200;
const ALLOWED: RateLimitDecision = { kind: 'allowed', headers: { limit: 10, remaining: 9, resetAtSeconds: 60 } };

type Harness = {
	readonly url: string;
	readonly completed: CompletedRequest[];
	readonly logLines: string[];
	readonly onRateLimitDegraded: ReturnType<typeof vi.fn>;
	readonly checkRateLimit: ReturnType<typeof vi.fn>;
	readonly store: ConfigStore;
};

describe('createRequestHandler', () => {
	let upstream: FakeUpstream;
	let server: Server;
	let harness: Harness;
	const agents = new UpstreamAgents();

	beforeAll(async () => {
		upstream = await startFakeUpstream('orders-1');
		const store = new ConfigStore();
		const completed: CompletedRequest[] = [];
		const logLines: string[] = [];
		const onRateLimitDegraded = vi.fn();
		const checkRateLimit = vi.fn();
		const snapshotInput = {
			instances: [buildInstance('orders-1', { url: upstream.url })],
			service: { timeoutMs: TIMEOUT_MS, retryMaxAttempts: 1 },
			routes: [
				{ id: 'orders', pathPrefix: '/api/orders', methods: ['GET', 'POST'] as const },
				{ id: 'open', pathPrefix: '/open', isAuthRequired: false },
			],
			consumers: [{ ...TEST_CONSUMER, allowedRouteIds: [] }],
		};

		store.replace(buildTestSnapshot(snapshotInput));
		const now = Date.now;
		const dependencies: RequestHandlerDependencies = {
			store,
			keys: new ApiKeyCache({
				lookup: async (keyHash) => (keyHash === hashApiKey(API_KEY) ? { keyId: 'k1', consumerId: TEST_CONSUMER.id } : null),
				now,
			}),
			keyUsage: new KeyUsageTracker({ write: async () => undefined, onError: () => undefined, now }),
			rateLimiter: { check: checkRateLimit } as unknown as GatewayRateLimiter,
			balancers: new PerServiceLoadBalancerRegistry(roundRobinForEveryStrategy),
			forward: {
				availability: new AlwaysAvailable(),
				attemptObserver: new NoopAttemptObserver(),
				retryPolicy: new NoRetryPolicy(),
				agents,
				sendAttempt,
				now,
			},
			requestObserver: { onRequestCompleted: (request) => completed.push(request) },
			logger: new GatewayLogger('gw', (line) => logLines.push(line)),
			maxRequestTimeoutMs: 5000,
			now,
			onRateLimitDegraded,
		};

		server = createServer(createRequestHandler(dependencies));
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

		harness = { url, completed, logLines, onRateLimitDegraded, checkRateLimit, store };
	});

	afterEach(() => {
		upstream.setBehavior({ kind: 'echo' });
		harness.checkRateLimit.mockReset().mockResolvedValue(ALLOWED);
		harness.completed.length = 0;
	});

	afterAll(async () => {
		agents.destroyAll();
		server.closeAllConnections();
		await new Promise((resolve) => server.close(resolve));
		await upstream.close();
	});

	function call(path: string, init: RequestInit = {}): Promise<Response> {
		const headers = new Headers(init.headers);

		if (!headers.has('authorization')) {
			headers.set('authorization', `Bearer ${API_KEY}`);
		}

		return fetch(`${harness.url}${path}`, { ...init, headers });
	}

	async function lastCompleted(): Promise<CompletedRequest> {
		await vi.waitFor(() => expect(harness.completed.length).toBeGreaterThan(0));

		return harness.completed.at(-1) as CompletedRequest;
	}

	it('relays the upstream answer with the gateway and limit headers, and reports the request', async () => {
		harness.checkRateLimit.mockResolvedValue(ALLOWED);

		const response = await call('/api/orders/7?x=1');

		expect(response.status).toBe(200);
		expect(((await response.json()) as { readonly url: string }).url).toBe('/7?x=1');
		expect(Object.fromEntries(response.headers)).toMatchObject({
			'x-pyle-route': 'orders',
			'x-pyle-instance': 'orders-1',
			'x-pyle-attempts': '1',
			'x-ratelimit-remaining': '9',
		});
		expect(await lastCompleted()).toMatchObject({ status: 200, routeId: 'orders', consumerId: TEST_CONSUMER.id, instanceName: 'orders-1' });
	});

	it('lets requests through without limit headers when the limiter is degraded', async () => {
		harness.checkRateLimit.mockResolvedValue({ kind: 'degraded' });

		const response = await call('/api/orders');

		expect(response.status).toBe(200);
		expect(response.headers.has('x-ratelimit-limit')).toBe(false);
		expect(harness.onRateLimitDegraded).toHaveBeenCalled();
	});

	it('rejects a limited request with its scope and when to retry', async () => {
		const limited: RateLimitDecision = {
			kind: 'limited',
			scope: 'route',
			retryAfterSeconds: 12,
			headers: { limit: 1, remaining: 0, resetAtSeconds: 12 },
		};

		harness.checkRateLimit.mockResolvedValue(limited);

		const response = await call('/api/orders', { method: 'POST', body: 'ignored' });

		expect(response.status).toBe(429);
		expect(response.headers.get('retry-after')).toBe('12');
		expect(await response.json()).toMatchObject({ error: 'rate_limited', scope: 'route' });
		expect(await lastCompleted()).toMatchObject({ status: 429, gatewayError: 'rate_limited' });
	});

	it('serves an open route anonymously', async () => {
		harness.checkRateLimit.mockResolvedValue({ kind: 'allowed', headers: null });

		const response = await fetch(`${harness.url}/open/ping`);

		expect(response.status).toBe(200);
		expect(await lastCompleted()).toMatchObject({ consumerId: null });
	});

	it('names its own upstream failures', async () => {
		upstream.setBehavior({ kind: 'delay', delayMs: TIMEOUT_MS * 3 });

		const response = await call('/api/orders');

		expect(response.status).toBe(504);
		expect(response.headers.get('x-pyle-route')).toBe('orders');
		expect(await lastCompleted()).toMatchObject({ gatewayError: 'upstream_timeout' });
	});

	it('logs a response the instance cut short', async () => {
		upstream.setBehavior({ kind: 'cut' });

		await expect(call('/api/orders').then((response) => response.text())).rejects.toThrow();

		await vi.waitFor(() => expect(harness.logLines.some((line) => line.includes('Response cut short'))).toBe(true));
	});

	it('does not blame the instance when the client leaves mid-body', async () => {
		upstream.setBehavior({ kind: 'stream', chunkCount: 50, chunkBytes: 64 * 1024, pauseMs: 10 });
		const controller = new AbortController();
		const linesBefore = harness.logLines.length;

		const response = await call('/api/orders', { signal: controller.signal });

		controller.abort();

		await expect(response.arrayBuffer()).rejects.toThrow();
		expect(await lastCompleted()).toMatchObject({ status: 499 });
		expect(harness.logLines.slice(linesBefore).some((line) => line.includes('Response cut short'))).toBe(false);
	});

	it('records a client that left before the answer as 499', async () => {
		upstream.setBehavior({ kind: 'delay', delayMs: TIMEOUT_MS / 2 });
		const controller = new AbortController();

		const pending = call('/api/orders', { signal: controller.signal });

		setTimeout(() => controller.abort(), 20);

		await expect(pending).rejects.toThrow();
		expect(await lastCompleted()).toMatchObject({ status: 499 });
	});

	it('answers internal_error when the pipeline itself throws', async () => {
		harness.checkRateLimit.mockRejectedValue(new Error('bug'));

		const response = await call('/api/orders');

		expect(response.status).toBe(500);
		expect(await response.json()).toMatchObject({ error: 'internal_error' });
		expect(harness.logLines.at(-1)).toContain('bug');
	});
});
