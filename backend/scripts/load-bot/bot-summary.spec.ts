import { describe, expect, it } from 'vitest';

import { BotSummary, percentile, routePrefixOf } from './bot-summary.js';

describe('BotSummary', () => {
	it('reports the spread per route and instance, and the statuses', () => {
		const summary = new BotSummary();

		for (const instance of ['orders-1', 'orders-2', 'orders-1']) {
			summary.add({ routePrefix: '/api/orders', status: 200, instance, latencyMs: 10 });
		}

		summary.add({ routePrefix: '/api/orders', status: 401, instance: null, latencyMs: 1 });

		expect(summary.report().split('\n')).toEqual([
			'4 requests  |  200: 3  401: 1',
			'',
			'/api/orders  (4)',
			'  (gateway)          1   25.0%',
			'  orders-1           2   50.0%',
			'  orders-2           1   25.0%',
		]);
	});

	it('prints one line per window and starts the next window fresh', () => {
		const summary = new BotSummary();

		for (const latencyMs of [10, 20, 30, 40]) {
			summary.add({ routePrefix: '/api/users', status: 200, instance: 'users-1', latencyMs });
		}

		expect(summary.takeWindowLine(2)).toBe('2.0 req/s  p50 30 ms  p95 40 ms  |  200: 4');
		expect(summary.takeWindowLine(5)).toBe('0.0 req/s  p50 - ms  p95 - ms  |  200: 4');
	});

	it('totals the whole run: p95 across windows, and only 5xx and unanswered requests as failures', () => {
		const summary = new BotSummary();

		for (let index = 0; index < 95; index++) {
			summary.add({ routePrefix: '/api/users', status: 200, instance: 'users-1', latencyMs: 10 });
		}

		for (const status of [401, 403, 429]) {
			summary.add({ routePrefix: '/api/users', status, instance: null, latencyMs: 1 });
		}

		summary.add({ routePrefix: '/api/users', status: 502, instance: null, latencyMs: 1 });
		summary.add({ routePrefix: '/api/users', status: 0, instance: null, latencyMs: 1 });
		summary.takeWindowLine(5);

		const totals = summary.totals();

		expect(totals.requests).toBe(100);
		expect(totals.serverErrorRate).toBeCloseTo(0.02);
		expect(totals.p95Ms).not.toBeNull();
		expect(totals.p95Ms ?? 0).toBeLessThanOrEqual(10);
	});

	it('totals an empty run as no failures and no percentile', () => {
		expect(new BotSummary().totals()).toEqual({ requests: 0, p95Ms: null, serverErrorRate: 0 });
	});

	it('finds the route of a path and a percentile of a sorted list', () => {
		expect(routePrefixOf('/api/orders/42?x=1')).toBe('/api/orders');
		expect(routePrefixOf('/api/public/health')).toBe('/api/public/health');
		expect(routePrefixOf('/elsewhere')).toBe('/elsewhere');
		expect(percentile([], 0.5)).toBeNull();
		expect(percentile([1, 2, 3, 4], 0.95)).toBe(4);
	});
});
