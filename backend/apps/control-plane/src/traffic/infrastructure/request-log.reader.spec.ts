import { describe, expect, it, vi } from 'vitest';

import type { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';
import { REQUEST_LOG_SCAN_PAGE, RequestLogReader } from './request-log.reader.js';

function entry(index: number, status = 200): string {
	return JSON.stringify({ requestId: `r${index}`, status });
}

function build(list: readonly string[]) {
	const lrange = vi.fn(async (_key: string, start: number, stop: number) => list.slice(start, stop + 1));

	return { reader: new RequestLogReader({ lrange } as unknown as ControlPlaneRedisService), lrange };
}

const ALL = { startIndex: 0, limit: 10, maxScanned: 1000, matches: () => true };

describe('RequestLogReader', () => {
	it('stops at the limit and says where to continue', async () => {
		const { reader } = build(Array.from({ length: 30 }, (_value, index) => entry(index)));

		const result = await reader.scan({ ...ALL, limit: 5, startIndex: 3 });

		expect(result.entries.map((item) => item.requestId)).toEqual(['r3', 'r4', 'r5', 'r6', 'r7']);
		expect(result.nextIndex).toBe(8);
	});

	it('pages through the list while filtering, and skips malformed entries', async () => {
		const list = Array.from({ length: REQUEST_LOG_SCAN_PAGE + 50 }, (_value, index) => entry(index, index % 100 === 0 ? 500 : 200));

		list[1] = '{broken';
		list[2] = JSON.stringify({ status: 500 });
		const { reader, lrange } = build(list);

		const result = await reader.scan({ ...ALL, matches: (item) => item.status === 500 });

		expect(result.entries.map((item) => item.requestId)).toEqual(['r0', 'r100', 'r200']);
		expect(result.nextIndex).toBeNull();
		expect(lrange).toHaveBeenCalledTimes(2);
	});

	it('gives up at the scan budget', async () => {
		const { reader } = build(Array.from({ length: 500 }, (_value, index) => entry(index)));

		const result = await reader.scan({ ...ALL, maxScanned: 50, matches: () => false });

		expect(result).toEqual({ entries: [], nextIndex: null });
	});
});
