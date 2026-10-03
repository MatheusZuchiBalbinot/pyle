import type { TrafficPoint, TrafficTotals } from '../../../traffic/domain/traffic-types.js';

// Points handed to the model per series: enough to see a shape, few
// enough to keep every tool answer well inside the context budget.
export const MAX_TRAFFIC_POINTS = 30;
const PERCENT = 100;
const COLUMNS = ['at', 'rps', 'p95', 'errPct', 'rl'] as const;

type ColumnSummary = { readonly min: number | null; readonly avg: number | null; readonly max: number | null; readonly last: number | null };

type CompactTraffic = {
	readonly columns: typeof COLUMNS;
	readonly rows: readonly Row[];
	readonly summary: { readonly rps: ColumnSummary; readonly p95: ColumnSummary; readonly errPct: ColumnSummary; readonly rl: ColumnSummary };
};

type Row = readonly [string, number, number | null, number, number];

// At most 30 rows of [at, rps, p95, errPct, rl], plus min/avg/max/last per column.
export function compactTraffic(series: readonly TrafficPoint[]): CompactTraffic {
	const groupSize = Math.max(1, Math.ceil(series.length / MAX_TRAFFIC_POINTS));
	const rows: Row[] = [];

	for (let start = 0; start < series.length; start += groupSize) {
		rows.push(mergeGroup(series.slice(start, start + groupSize)));
	}

	return {
		columns: COLUMNS,
		rows,
		summary: {
			rps: summarize(rows.map((row) => row[1])),
			p95: summarize(rows.map((row) => row[2])),
			errPct: summarize(rows.map((row) => row[3])),
			rl: summarize(rows.map((row) => row[4])),
		},
	};
}

export function compactTotals(totals: TrafficTotals): Readonly<Record<string, number | null>> {
	return {
		requests: totals.requestCount,
		rps: round(totals.requestsPerSecond),
		errPct: round(totals.errorRate * PERCENT, 2),
		clientErrPct: round(totals.clientErrorRate * PERCENT, 2),
		rateLimited: totals.rateLimitedCount,
		p50: totals.p50Ms === null ? null : round(totals.p50Ms),
		p95: totals.p95Ms === null ? null : round(totals.p95Ms),
		p99: totals.p99Ms === null ? null : round(totals.p99Ms),
		retries: totals.retryCount,
	};
}

function round(value: number, decimals = 1): number {
	const factor = 10 ** decimals;

	return Math.round(value * factor) / factor;
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

// Consecutive points merged: mean rate and error rate, the worst p95 (a
// spike must survive the merge), summed 429s.
function mergeGroup(points: readonly TrafficPoint[]): Row {
	const p95s = points.map((point) => point.p95Ms).filter((value): value is number => value !== null);
	const worstP95 = p95s.length === 0 ? null : round(Math.max(...p95s));
	const rateLimited = points.reduce((sum, point) => sum + point.rateLimitedCount, 0);

	return [
		points[0].at,
		round(mean(points.map((point) => point.requestsPerSecond))),
		worstP95,
		round(mean(points.map((point) => point.errorRate)) * PERCENT, 2),
		rateLimited,
	];
}

function summarize(values: readonly (number | null)[]): ColumnSummary {
	const defined = values.filter((value): value is number => value !== null);

	if (defined.length === 0) {
		return { min: null, avg: null, max: null, last: null };
	}

	return { min: round(Math.min(...defined)), avg: round(mean(defined)), max: round(Math.max(...defined)), last: round(defined[defined.length - 1]) };
}
