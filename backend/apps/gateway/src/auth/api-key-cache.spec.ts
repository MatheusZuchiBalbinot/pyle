import { describe, expect, it, vi } from 'vitest';

import { ApiKeyCache, type ResolvedKey } from './api-key-cache.js';

const KEY: ResolvedKey = { keyId: 'k1', consumerId: 'c1' };

function build(lookupResult: ResolvedKey | null = KEY, maxEntries = 10) {
	let now = 0;
	const lookup = vi.fn().mockResolvedValue(lookupResult);
	const cache = new ApiKeyCache({ lookup, now: () => now, positiveTtlMs: 1000, negativeTtlMs: 100, maxEntries });

	return { cache, lookup, advance: (ms: number) => (now += ms) };
}

describe('ApiKeyCache', () => {
	it('looks a key up once and serves it from memory until it expires', async () => {
		const { cache, lookup, advance } = build();

		expect(await cache.resolve('h')).toEqual(KEY);
		advance(999);
		expect(await cache.resolve('h')).toEqual(KEY);
		expect(lookup).toHaveBeenCalledTimes(1);

		advance(1);
		await cache.resolve('h');
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('remembers an unknown key for a short while only', async () => {
		const { cache, lookup, advance } = build(null);

		expect(await cache.resolve('bad')).toBeNull();
		await cache.resolve('bad');
		expect(lookup).toHaveBeenCalledTimes(1);

		advance(100);
		await cache.resolve('bad');
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('shares one lookup between concurrent requests for the same key', async () => {
		const { cache, lookup } = build();

		await Promise.all([cache.resolve('h'), cache.resolve('h'), cache.resolve('h')]);

		expect(lookup).toHaveBeenCalledTimes(1);
	});

	it('evicts the least recently used key past its bound', async () => {
		const { cache, lookup } = build(KEY, 2);

		await cache.resolve('a');
		await cache.resolve('b');
		await cache.resolve('a');
		await cache.resolve('c');
		expect(cache.size).toBe(2);

		await cache.resolve('b');
		expect(lookup).toHaveBeenCalledTimes(4);
	});

	it('forgets everything when keys change', async () => {
		const { cache, lookup } = build();

		await cache.resolve('h');

		cache.clear();
		await cache.resolve('h');

		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('uses the wall clock and default bounds when none are given', async () => {
		const cache = new ApiKeyCache({ lookup: vi.fn().mockResolvedValue(KEY) });

		expect(await cache.resolve('h')).toEqual(KEY);
	});
});
