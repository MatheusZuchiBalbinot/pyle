import { afterEach, describe, expect, it, vi } from 'vitest';

import { TIMED_OUT, withTimeout } from './with-timeout.js';

describe('withTimeout', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns the value when it arrives in time, leaving no timer behind', async () => {
		vi.useFakeTimers();

		await expect(withTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('ok');
		expect(vi.getTimerCount()).toBe(0);
	});

	it('returns TIMED_OUT when the promise is slower', async () => {
		vi.useFakeTimers();
		const never = new Promise<string>(() => undefined);

		const result = withTimeout(never, 1000);

		await vi.advanceTimersByTimeAsync(1000);

		await expect(result).resolves.toBe(TIMED_OUT);
	});

	it('passes a rejection through', async () => {
		await expect(withTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow('boom');
	});
});
