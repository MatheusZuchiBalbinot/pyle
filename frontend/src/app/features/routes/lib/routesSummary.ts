import type { RouteRow } from '@/app/features/routes/hooks/useRoutesPage';

export type RoutesSummary = {
	readonly routeCount: number;
	readonly protectedCount: number;
	readonly limitedCount: number;
	readonly requestsPerSecond: number;
	readonly rateLimitedCount: number;
	// Null when no route had traffic in the window.
	readonly slowest: { readonly name: string; readonly p95Ms: number } | null;
};

// The figures above the routes table, from the same 15-minute totals its columns show.
export function summarizeRoutes(rows: readonly RouteRow[]): RoutesSummary {
	const withTraffic = rows.filter(hasLatency);
	const slowestRow = withTraffic.reduce<RouteRow | null>(pickSlower, null);

	return {
		routeCount: rows.length,
		protectedCount: rows.filter((row) => row.route.isAuthRequired).length,
		limitedCount: rows.filter((row) => row.route.rateLimitPerMinute !== null).length,
		requestsPerSecond: rows.reduce((sum, row) => sum + (row.totals?.requestsPerSecond ?? 0), 0),
		rateLimitedCount: rows.reduce((sum, row) => sum + (row.totals?.rateLimitedCount ?? 0), 0),
		slowest: slowestRow === null ? null : { name: slowestRow.route.name, p95Ms: p95Of(slowestRow) },
	};
}

function hasLatency(row: RouteRow): boolean {
	return row.totals !== null && row.totals.p95Ms !== null;
}

function pickSlower(slowest: RouteRow | null, row: RouteRow): RouteRow {
	if (slowest === null || p95Of(row) > p95Of(slowest)) {
		return row;
	}

	return slowest;
}

function p95Of(row: RouteRow): number {
	return row.totals?.p95Ms ?? 0;
}
