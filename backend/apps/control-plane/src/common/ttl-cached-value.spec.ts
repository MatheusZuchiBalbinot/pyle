import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TtlCachedValue } from './ttl-cached-value.js';

describe('TtlCachedValue', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('loads once and serves the cached value while fresh', async () => {
		const load = vi.fn().mockResolvedValue('v1');
		const cache = new TtlCachedValue({ ttlMs: 1000, load });

		expect(await cache.get()).toBe('v1');
		expect(await cache.get()).toBe('v1');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('reloads after the TTL has elapsed', async () => {
		const load = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
		const cache = new TtlCachedValue({ ttlMs: 1000, load });

		await cache.get();
		vi.advanceTimersByTime(1001);
		expect(await cache.get()).toBe('v2');
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('deduplicates concurrent callers into a single load', async () => {
		let resolveLoad: (value: string) => void = () => {};

		const load = vi.fn(() => new Promise<string>((resolve) => (resolveLoad = resolve)));
		const cache = new TtlCachedValue({ ttlMs: 1000, load });
		const first = cache.get();
		const second = cache.get();

		resolveLoad('v1');
		expect(await Promise.all([first, second])).toEqual(['v1', 'v1']);
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('keeps serving the last good value when a refresh fails', async () => {
		const onLoadError = vi.fn();
		const load = vi.fn().mockResolvedValueOnce('v1').mockRejectedValueOnce(new Error('boom'));
		const cache = new TtlCachedValue({ ttlMs: 1000, load, onLoadError });

		await cache.get();
		vi.advanceTimersByTime(1001);
		expect(await cache.get()).toBe('v1');
		expect(onLoadError).toHaveBeenCalledOnce();
	});

	it('rejects when the very first load fails', async () => {
		const load = vi.fn().mockRejectedValue(new Error('boom'));
		const cache = new TtlCachedValue({ ttlMs: 1000, load });

		await expect(cache.get()).rejects.toThrow('boom');
	});

	it('invalidate forces the next get to reload', async () => {
		const load = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2');
		const cache = new TtlCachedValue({ ttlMs: 1000, load });

		await cache.get();
		cache.invalidate();
		expect(await cache.get()).toBe('v2');
	});
});
