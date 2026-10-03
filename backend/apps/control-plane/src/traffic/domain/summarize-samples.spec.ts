import { describe, expect, it } from 'vitest';

import { emptyHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import { EMPTY_COUNTS, groupByKey, stepStarts, sumCounts, toSeries, toTotals } from './summarize-samples.js';
import type { SampleRow } from './traffic-types.js';

function histogram(entries: Readonly<Record<number, number>>): number[] {
	const buckets = emptyHistogram();

	for (const [index, count] of Object.entries(entries)) {
		buckets[Number(index)] = count;
	}

	return buckets;
}

function row(overrides: Partial<SampleRow>): SampleRow {
	return { ...EMPTY_COUNTS, at: null, key: null, ...overrides };
}

const WINDOW = { from: new Date('2026-09-26T12:00:05.000Z'), to: new Date('2026-09-26T12:00:35.000Z'), stepSeconds: 10 };

describe('summarize samples', () => {
	it('adds counters and histograms', () => {
		const sum = sumCounts([
			row({ requestCount: 2, status5xx: 1, latencyBuckets: histogram({ 0: 2 }) }),
			row({ requestCount: 3, retryCount: 2, latencyBuckets: histogram({ 1: 3 }) }),
		]);

		expect(sum).toMatchObject({ requestCount: 5, status5xx: 1, retryCount: 2 });
		expect(sum.latencyBuckets.slice(0, 2)).toEqual([2, 3]);
	});

	it('computes rates, excluding the gateway 429 from client errors', () => {
		const totals = toTotals(row({ requestCount: 100, status4xx: 30, rateLimitedCount: 10, status5xx: 5, retryCount: 4 }), 50);

		expect(totals).toMatchObject({
			requestCount: 100,
			requestsPerSecond: 2,
			errorRate: 0.05,
			clientErrorRate: 0.2,
			rateLimitedCount: 10,
			retryCount: 4,
		});
		expect(toTotals(EMPTY_COUNTS, 0)).toMatchObject({ requestsPerSecond: 0, errorRate: 0, p95Ms: null });
	});

	it('takes percentiles from the summed histogram, not an average of percentiles', () => {
		// 90 fast requests on one instance, 10 slow on another: the averaged
		// p95 of the two would be ~1300 ms; the real p95 is in the slow bucket.
		const fast = row({ requestCount: 90, latencyBuckets: histogram({ 0: 90 }) });
		const slow = row({ requestCount: 10, latencyBuckets: histogram({ 8: 10 }) });

		const totals = toTotals(sumCounts([fast, slow]), 10);

		expect(totals.p50Ms).toBeLessThanOrEqual(5);
		expect(totals.p95Ms).toBeGreaterThan(1000);
		expect(totals.p95Ms).toBeLessThanOrEqual(2500);
	});

	it('aligns steps to the epoch and fills empty ones', () => {
		const at = new Date('2026-09-26T12:00:10.000Z');
		const series = toSeries(
			[row({ at, requestCount: 20, status5xx: 2, latencyBuckets: histogram({ 2: 20 }) }), row({ at, requestCount: 10 })],
			WINDOW,
		);

		expect(stepStarts(WINDOW).map((start) => new Date(start).toISOString().slice(14, 19))).toEqual(['00:00', '00:10', '00:20', '00:30']);
		expect(series).toHaveLength(4);
		expect(series[1]).toMatchObject({ at: at.toISOString(), requestsPerSecond: 3, errorRate: 2 / 30 });
		expect(series[0]).toMatchObject({ requestsPerSecond: 0, p95Ms: null });
	});

	it('ignores rows without a time in a series and groups rows by key', () => {
		const rows = [row({ key: 'a', requestCount: 1 }), row({ key: 'b', requestCount: 2 }), row({ key: 'a', requestCount: 3 })];

		expect(toSeries(rows, WINDOW).every((point) => point.requestsPerSecond === 0)).toBe(true);
		expect([...groupByKey(rows).entries()].map(([key, group]) => [key, group.length])).toEqual([
			['a', 2],
			['b', 1],
		]);
	});
});
