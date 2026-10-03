import { describe, expect, it } from 'vitest';

import { AdminApiError } from '@/app/api/adminApiClient';

import { shouldRetry } from './queryClient';

describe('shouldRetry', () => {
	it('never retries a 4xx: the API will answer the same', () => {
		expect(shouldRetry(0, new AdminApiError('Not found', 404))).toBe(false);
		expect(shouldRetry(0, new AdminApiError('Unauthorized', 401))).toBe(false);
	});

	it('retries a 5xx or a network failure once', () => {
		expect(shouldRetry(0, new AdminApiError('Bad gateway', 502))).toBe(true);
		expect(shouldRetry(0, new TypeError('fetch failed'))).toBe(true);
		expect(shouldRetry(1, new TypeError('fetch failed'))).toBe(false);
	});
});
