import { describe, expect, it, vi } from 'vitest';

import { HttpHealthProbe } from './http-health-probe.js';

describe('HttpHealthProbe', () => {
	it('answers true once the URL answers 2xx', async () => {
		const fetchUrl = vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')).mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });

		await expect(new HttpHealthProbe(fetchUrl).waitUntilHealthy('http://localhost:48200/health', 10_000)).resolves.toBe(true);
		expect(fetchUrl).toHaveBeenCalledTimes(3);
	});

	it('gives up at the deadline', async () => {
		let now = 0;
		const fetchUrl = vi.fn(async () => {
			now += 1000;

			return { ok: false };
		});

		await expect(new HttpHealthProbe(fetchUrl, () => now).waitUntilHealthy('http://x/health', 1500)).resolves.toBe(false);
	});
});
