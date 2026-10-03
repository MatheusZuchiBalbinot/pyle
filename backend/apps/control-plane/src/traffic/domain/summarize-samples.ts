import { emptyHistogram, mergeHistograms, percentileFromHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import type { SampleCounts, SampleRow, TrafficPoint, TrafficTotals } from './traffic-types.js';
import type { ResolvedTrafficWindow } from './traffic-window.js';

const P50 = 0.5;
const P95 = 0.95;
const P99 = 0.99;
const MS_PER_SECOND = 1000;

export const EMPTY_COUNTS: SampleCounts = {
	requestCount: 0,
	status2xx: 0,
	status3xx: 0,
	status4xx: 0,
	status5xx: 0,
	rateLimitedCount: 0,
	gatewayErrorCount: 0,
	retryCount: 0,
	latencyBuckets: emptyHistogram(),
};

// Adds counters and histograms; percentiles are only ever taken from the
// summed histogram (never an average of percentiles).
export function sumCounts(rows: readonly SampleCounts[]): SampleCounts {
	return rows.reduce<SampleCounts>(
		(sum, row) => ({
			requestCount: sum.requestCount + row.requestCount,
			status2xx: sum.status2xx + row.status2xx,
			status3xx: sum.status3xx + row.status3xx,
			status4xx: sum.status4xx + row.status4xx,
			status5xx: sum.status5xx + row.status5xx,
			rateLimitedCount: sum.rateLimitedCount + row.rateLimitedCount,
			gatewayErrorCount: sum.gatewayErrorCount + row.gatewayErrorCount,
			retryCount: sum.retryCount + row.retryCount,
			latencyBuckets: mergeHistograms([sum.latencyBuckets, row.latencyBuckets]),
		}),
		EMPTY_COUNTS,
	);
}

export function toTotals(counts: SampleCounts, seconds: number): TrafficTotals {
	return {
		requestCount: counts.requestCount,
		requestsPerSecond: ratio(counts.requestCount, seconds),
		errorRate: ratio(counts.status5xx, counts.requestCount),
		clientErrorRate: ratio(counts.status4xx - counts.rateLimitedCount, counts.requestCount),
		rateLimitedCount: counts.rateLimitedCount,
		p50Ms: percentileFromHistogram(counts.latencyBuckets, P50),
		p95Ms: percentileFromHistogram(counts.latencyBuckets, P95),
		p99Ms: percentileFromHistogram(counts.latencyBuckets, P99),
		retryCount: counts.retryCount,
	};
}

export function windowSeconds(window: ResolvedTrafficWindow): number {
	return (window.to.getTime() - window.from.getTime()) / MS_PER_SECOND;
}

// The step starts covering the window, aligned like the database's
// date_bin (multiples of the step since the epoch).
export function stepStarts(window: ResolvedTrafficWindow): readonly number[] {
	const stepMs = window.stepSeconds * MS_PER_SECOND;
	const first = Math.floor(window.from.getTime() / stepMs) * stepMs;
	const starts: number[] = [];

	for (let start = first; start < window.to.getTime(); start += stepMs) {
		starts.push(start);
	}

	return starts;
}

// A continuous series, one point per step; steps without samples are
// zeros with null percentiles, so the chart has no holes.
export function toSeries(rows: readonly SampleRow[], window: ResolvedTrafficWindow): readonly TrafficPoint[] {
	const byStep = new Map<number, SampleCounts[]>();

	for (const row of rows) {
		if (row.at === null) {
			continue;
		}

		const stepRows = byStep.get(row.at.getTime()) ?? [];

		stepRows.push(row);
		byStep.set(row.at.getTime(), stepRows);
	}

	return stepStarts(window).map((start) => {
		const totals = toTotals(sumCounts(byStep.get(start) ?? []), window.stepSeconds);
		const { requestsPerSecond, errorRate, rateLimitedCount, p50Ms, p95Ms, p99Ms } = totals;

		return { at: new Date(start).toISOString(), requestsPerSecond, errorRate, rateLimitedCount, p50Ms, p95Ms, p99Ms };
	});
}

export function groupByKey(rows: readonly SampleRow[]): ReadonlyMap<string | null, readonly SampleRow[]> {
	const groups = new Map<string | null, SampleRow[]>();

	for (const row of rows) {
		const group = groups.get(row.key) ?? [];

		group.push(row);
		groups.set(row.key, group);
	}

	return groups;
}

function ratio(part: number, total: number): number {
	if (total === 0) {
		return 0;
	}

	return part / total;
}
