import { describe, expect, it } from 'vitest';

import type { RetryDecisionInput } from '../contracts/retry-policy.js';
import { IdempotentRetryPolicy, MIN_RETRY_BUDGET_MS } from './idempotent-retry-policy.js';

const RETRYABLE: RetryDecisionInput = {
	method: 'GET',
	hasRequestBody: false,
	outcome: { kind: 'connection_error', errorCode: 'ECONNREFUSED' },
	attemptNumber: 1,
	maxAttempts: 2,
	remainingBudgetMs: 1000,
};

describe('IdempotentRetryPolicy', () => {
	const policy = new IdempotentRetryPolicy();

	it.each([
		{ name: 'a refused GET', change: {} },
		{ name: 'a HEAD that timed out', change: { method: 'HEAD', outcome: { kind: 'timeout' } } },
		{ name: 'an options request answered 503', change: { method: 'options', outcome: { kind: 'response', status: 503 } } },
		{ name: 'a GET answered 502', change: { outcome: { kind: 'response', status: 502 } } },
		{ name: 'a GET answered 504', change: { outcome: { kind: 'response', status: 504 } } },
		{ name: 'with exactly the minimum budget', change: { remainingBudgetMs: MIN_RETRY_BUDGET_MS } },
	])('retries $name', ({ change }) => {
		expect(policy.shouldRetry({ ...RETRYABLE, ...change } as RetryDecisionInput)).toBe(true);
	});

	it.each([
		{ name: 'a POST', change: { method: 'POST' } },
		{ name: 'a GET with a body', change: { hasRequestBody: true } },
		{ name: 'a 500 (the instance answered for real)', change: { outcome: { kind: 'response', status: 500 } } },
		{ name: 'a 404', change: { outcome: { kind: 'response', status: 404 } } },
		{ name: 'a client that went away', change: { outcome: { kind: 'aborted' } } },
		{ name: 'the last allowed attempt', change: { attemptNumber: 2 } },
		{ name: 'an exhausted budget', change: { remainingBudgetMs: MIN_RETRY_BUDGET_MS - 1 } },
	])('does not retry $name', ({ change }) => {
		expect(policy.shouldRetry({ ...RETRYABLE, ...change } as RetryDecisionInput)).toBe(false);
	});
});
