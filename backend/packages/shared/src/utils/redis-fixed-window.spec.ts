import { describe, expect, it, vi } from 'vitest';

import { incrementFixedWindow, type RedisScriptRunner } from './redis-fixed-window.js';

function fakeRedis(result: readonly [number, number]): RedisScriptRunner & { readonly eval: ReturnType<typeof vi.fn> } {
	return { eval: vi.fn().mockResolvedValue(result) };
}

describe('incrementFixedWindow', () => {
	it('returns the count and when the window resets', async () => {
		const redis = fakeRedis([3, 40_000]);

		const result = await incrementFixedWindow(redis, { key: 'k', windowMs: 60_000, nowMs: 1_000 });

		expect(result).toEqual({ count: 3, resetAtMs: 41_000 });
		expect(redis.eval).toHaveBeenCalledWith(expect.stringContaining('INCR'), 1, 'k', 60_000);
	});

	it('assumes a full window when the key has no TTL', async () => {
		const result = await incrementFixedWindow(fakeRedis([1, -1]), { key: 'k', windowMs: 60_000, nowMs: 0 });

		expect(result.resetAtMs).toBe(60_000);
	});
});
