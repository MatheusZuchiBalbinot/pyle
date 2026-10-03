import { describe, expect, it } from 'vitest';

import type { RouteRow } from '@/app/features/routes/hooks/useRoutesPage';
import { buildRoute, buildTrafficTotals } from '@/test/gatewayFixtures';

import { summarizeRoutes } from './routesSummary';

describe('summarizeRoutes', () => {
	it('adds up the traffic and names the slowest route', () => {
		const rows: readonly RouteRow[] = [
			{
				route: buildRoute('orders', { rateLimitPerMinute: 600 }),
				totals: buildTrafficTotals({ requestsPerSecond: 10, p95Ms: 40, rateLimitedCount: 3 }),
			},
			{
				route: buildRoute('catalog', { isAuthRequired: false }),
				totals: buildTrafficTotals({ requestsPerSecond: 5, p95Ms: 90, rateLimitedCount: 0 }),
			},
			{ route: buildRoute('users'), totals: null },
		];

		expect(summarizeRoutes(rows)).toEqual({
			routeCount: 3,
			protectedCount: 2,
			limitedCount: 1,
			requestsPerSecond: 15,
			rateLimitedCount: 3,
			slowest: { name: rows[1].route.name, p95Ms: 90 },
		});
	});

	it('has no slowest route without traffic', () => {
		expect(summarizeRoutes([{ route: buildRoute('orders'), totals: null }]).slowest).toBeNull();
	});
});
