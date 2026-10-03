import { describe, expect, it } from 'vitest';

import type { TrafficPoint } from '../../../traffic/domain/traffic-types.js';
import { compactTotals, compactTraffic, MAX_TRAFFIC_POINTS } from './compact-traffic.js';

function point(index: number, overrides: Partial<TrafficPoint> = {}): TrafficPoint {
	return { at: `t${index}`, requestsPerSecond: 10, errorRate: 0.01, rateLimitedCount: 1, p50Ms: 10, p95Ms: 50, p99Ms: 90, ...overrides };
}

describe('compactTraffic', () => {
	it('keeps short series as they are', () => {
		const compact = compactTraffic([point(0), point(1, { p95Ms: null })]);

		expect(compact.columns).toEqual(['at', 'rps', 'p95', 'errPct', 'rl']);
		expect(compact.rows).toEqual([
			['t0', 10, 50, 1, 1],
			['t1', 10, null, 1, 1],
		]);
	});

	it('merges long series into at most 30 rows, keeping spikes', () => {
		const series = Array.from({ length: 91 }, (_value, index) => point(index, { p95Ms: index === 40 ? 1500 : 50, requestsPerSecond: index }));

		const compact = compactTraffic(series);

		expect(compact.rows.length).toBeLessThanOrEqual(MAX_TRAFFIC_POINTS);
		expect(compact.summary.p95.max).toBe(1500);
		expect(compact.rows[0]).toEqual(['t0', 1.5, 50, 1, 4]);
		expect(compact.summary.rps).toMatchObject({ min: 1.5, last: 89 });
	});

	it('summarizes an empty series as nothing', () => {
		expect(compactTraffic([]).summary.p95).toEqual({ min: null, avg: null, max: null, last: null });
	});
});

describe('compactTotals', () => {
	it('rounds and turns rates into percents', () => {
		const totals = {
			requestCount: 100,
			requestsPerSecond: 1.234,
			errorRate: 0.0123,
			clientErrorRate: 0.1,
			rateLimitedCount: 2,
			p50Ms: 10.04,
			p95Ms: null,
			p99Ms: 99.99,
			retryCount: 3,
		};

		expect(compactTotals(totals)).toEqual({
			requests: 100,
			rps: 1.2,
			errPct: 1.23,
			clientErrPct: 10,
			rateLimited: 2,
			p50: 10,
			p95: null,
			p99: 100,
			retries: 3,
		});
	});
});
