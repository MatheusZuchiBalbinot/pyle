import { describe, expect, it, vi } from 'vitest';

import { ChaosInstanceUnreachableError } from '../domain/config-errors.js';
import { DemoChaosClient, type FetchFunction } from './demo-chaos.client.js';

const CHAOS = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: true };
const INPUT = { instanceUrl: 'http://localhost:48101', token: 'a-chaos-token-long-enough', chaos: CHAOS };

describe('DemoChaosClient', () => {
	it('PUTs the chaos to the instance with its token', async () => {
		const fetchFunction = vi.fn().mockResolvedValue({ ok: true, status: 200 });

		await new DemoChaosClient(fetchFunction as unknown as FetchFunction).apply(INPUT);

		const [url, init] = fetchFunction.mock.calls[0] as [string, RequestInit];

		expect(url).toBe('http://localhost:48101/__chaos');
		expect(init).toMatchObject({ method: 'PUT', body: JSON.stringify(CHAOS) });
		expect(new Headers(init.headers).get('x-chaos-token')).toBe('a-chaos-token-long-enough');
	});

	it('reports an instance that refused the request', async () => {
		const fetchFunction = vi.fn().mockResolvedValue({ ok: false, status: 404 });

		await expect(new DemoChaosClient(fetchFunction as unknown as FetchFunction).apply(INPUT)).rejects.toThrow(ChaosInstanceUnreachableError);
	});

	it('reports an instance that did not answer', async () => {
		const fetchFunction = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

		await expect(new DemoChaosClient(fetchFunction as unknown as FetchFunction).apply(INPUT)).rejects.toThrow(/did not answer.*fetch failed/);
	});

	it('uses the global fetch when none is given', () => {
		expect(new DemoChaosClient()).toBeInstanceOf(DemoChaosClient);
	});
});
