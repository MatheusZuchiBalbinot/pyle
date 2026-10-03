import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import type { InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import { RoundRobinBalancer } from '../balancing/round-robin.js';
import type { AttemptOutcome } from '../contracts/attempt-observer.js';
import { NoRetryPolicy, type RetryPolicy } from '../contracts/retry-policy.js';
import { buildInstance, TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { forwardWithRetry, type ForwardDependencies, type ForwardRequest, type SendAttempt } from './forward-with-retry.js';
import { UpstreamAgents } from './upstream-agents.js';
import type { AttemptResult } from './upstream-attempt.js';

const [A, B, C] = ['a', 'b', 'c'].map((name) => buildInstance(name, { url: `http://127.0.0.1:1/${name}` }));
const ALWAYS_RETRY: RetryPolicy = { shouldRetry: () => true };

function responseWith(status: number): AttemptResult {
	return { kind: 'response', response: { statusCode: status, resume: vi.fn() } as unknown as IncomingMessage };
}

function build(options: {
	readonly send: SendAttempt;
	readonly retryPolicy?: RetryPolicy;
	readonly unavailable?: readonly string[];
	readonly now?: () => number;
}) {
	const observer = { onAttemptStart: vi.fn(), onAttemptEnd: vi.fn() };
	const unavailable = new Set(options.unavailable ?? []);
	const dependencies: ForwardDependencies = {
		availability: { isAvailable: (instanceId) => !unavailable.has(instanceId) },
		attemptObserver: observer,
		retryPolicy: options.retryPolicy ?? new NoRetryPolicy(),
		agents: new UpstreamAgents(),
		sendAttempt: options.send,
		now: options.now ?? (() => 0),
	};

	return { dependencies, observer };
}

function forwardRequest(instances: readonly InstanceConfig[], overrides: Partial<ForwardRequest> = {}): ForwardRequest {
	return {
		service: { ...TEST_SERVICE, instances, retryMaxAttempts: 3 },
		balancer: new RoundRobinBalancer(),
		method: 'GET',
		body: null,
		buildTarget: (instance) => ({ url: new URL(instance.url), headers: {} }),
		perAttemptTimeoutMs: 1000,
		deadlineMs: 3000,
		signal: new AbortController().signal,
		...overrides,
	};
}

describe('forwardWithRetry', () => {
	it('relays the first answer when retries are off, whatever it was', async () => {
		const send = vi.fn<SendAttempt>().mockResolvedValue(responseWith(502));
		const { dependencies, observer } = build({ send });

		const result = await forwardWithRetry(forwardRequest([A, B]), dependencies);

		expect(result).toMatchObject({ kind: 'response', instance: A, attempts: 1 });
		expect(observer.onAttemptStart).toHaveBeenCalledWith(A.id);
		expect(observer.onAttemptEnd).toHaveBeenCalledWith(A.id, { kind: 'response', status: 502 });
	});

	it('tries another instance after a failure, never the same one twice, and drops the retried response', async () => {
		const failed = responseWith(503);
		const send = vi
			.fn<SendAttempt>()
			.mockResolvedValueOnce(failed)
			.mockResolvedValueOnce({ kind: 'connection_error', errorCode: 'ECONNREFUSED' })
			.mockResolvedValueOnce(responseWith(200));
		const { dependencies } = build({ send, retryPolicy: ALWAYS_RETRY });

		const result = await forwardWithRetry(forwardRequest([A, B, C]), dependencies);

		const triedPaths = send.mock.calls.map(([input]) => input.target.url.pathname);

		expect(result).toMatchObject({ kind: 'response', attempts: 3 });
		expect((failed as { readonly response: { readonly resume: () => void } }).response.resume).toHaveBeenCalled();
		expect(new Set(triedPaths)).toEqual(new Set(['/a', '/b', '/c']));
	});

	it('gives up with the last failure once every instance was tried', async () => {
		const outcome: AttemptOutcome = { kind: 'timeout' };
		const send = vi.fn<SendAttempt>().mockResolvedValue(outcome);
		const { dependencies } = build({ send, retryPolicy: ALWAYS_RETRY });

		const result = await forwardWithRetry(forwardRequest([A, B]), dependencies);

		expect(result).toMatchObject({ kind: 'failed', outcome, attempts: 2 });
	});

	it('skips drained and unavailable instances, and says so when none is left', async () => {
		const send = vi.fn<SendAttempt>().mockResolvedValue(responseWith(200));
		const drained = { ...A, isEnabled: false };
		const { dependencies } = build({ send, unavailable: [B.id] });

		expect(await forwardWithRetry(forwardRequest([drained, B]), dependencies)).toEqual({ kind: 'no_instance', attempts: 0 });
		expect(send).not.toHaveBeenCalled();
		expect(await forwardWithRetry(forwardRequest([drained, B, C]), dependencies)).toMatchObject({ kind: 'response', instance: C });
	});

	it('gives each attempt what is left of the budget, at least a millisecond', async () => {
		let now = 0;
		const send = vi.fn<SendAttempt>(async () => {
			now += 800;

			return { kind: 'timeout' };
		});
		const { dependencies } = build({ send, retryPolicy: ALWAYS_RETRY, now: () => now });

		await forwardWithRetry(forwardRequest([A, B, C], { deadlineMs: 1500 }), dependencies);

		expect(send.mock.calls.map(([input]) => input.timeoutMs)).toEqual([1000, 700, 1]);
	});

	it('tells the policy what happened, including whether a body was sent', async () => {
		const shouldRetry = vi.fn().mockReturnValue(false);
		const send = vi.fn<SendAttempt>().mockResolvedValue({ kind: 'connection_error', errorCode: 'ECONNRESET' });
		const { dependencies } = build({ send, retryPolicy: { shouldRetry } });

		await forwardWithRetry(forwardRequest([A, B], { method: 'POST', body: {} as IncomingMessage }), dependencies);

		expect(shouldRetry).toHaveBeenCalledWith({
			method: 'POST',
			hasRequestBody: true,
			outcome: { kind: 'connection_error', errorCode: 'ECONNRESET' },
			attemptNumber: 1,
			maxAttempts: 3,
			remainingBudgetMs: 3000,
		});
	});

	it('does not ask the policy when there is no other instance to try', async () => {
		const shouldRetry = vi.fn().mockReturnValue(true);
		const send = vi.fn<SendAttempt>().mockResolvedValue(responseWith(500));
		const { dependencies } = build({ send, retryPolicy: { shouldRetry } });

		await forwardWithRetry(forwardRequest([A]), dependencies);

		expect(shouldRetry).not.toHaveBeenCalled();
	});

	it('counts a response without a status as status 0 for the observer', async () => {
		const send = vi.fn<SendAttempt>().mockResolvedValue({ kind: 'response', response: { resume: vi.fn() } as unknown as IncomingMessage });
		const { dependencies, observer } = build({ send });

		await forwardWithRetry(forwardRequest([A]), dependencies);

		expect(observer.onAttemptEnd).toHaveBeenCalledWith(A.id, { kind: 'response', status: 0 });
	});
});
