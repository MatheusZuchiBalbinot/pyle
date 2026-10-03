import { describe, expect, it } from 'vitest';

import { percentileFromHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import { splitCount } from './synthesize-traffic/daily-curve.js';
import { DEMO_LIVE_RPS } from './demo-traffic.js';
import {
	createSeededRandom,
	dailyCurve,
	SEED_GATEWAY_ID,
	synthesizeTraffic,
	type SynthesisCatalog,
	type SynthesisInput,
} from './synthesize-traffic.js';

const NOW = Date.UTC(2026, 8, 26, 18, 0, 3);
const HOUR = 3_600_000;

const CATALOG: SynthesisCatalog = {
	routes: [
		{ routeId: 'r-orders', pathPrefix: '/api/orders', serviceSlug: 'orders' },
		{ routeId: 'r-users', pathPrefix: '/api/users', serviceSlug: 'users' },
		{ routeId: 'r-catalog', pathPrefix: '/api/catalog', serviceSlug: 'catalog' },
		{ routeId: 'r-public', pathPrefix: '/api/public/health', serviceSlug: 'catalog' },
		{ routeId: 'r-unknown', pathPrefix: '/api/other', serviceSlug: 'orders' },
	],
	instancesByService: new Map([
		['orders', ['orders-1', 'orders-2', 'orders-3'].map((name) => ({ instanceId: `i-${name}`, name, weight: 1 }))],
		['users', ['users-1', 'users-2'].map((name) => ({ instanceId: `i-${name}`, name, weight: 1 }))],
		[
			'catalog',
			[
				{ instanceId: 'i-catalog-1', name: 'catalog-1', weight: 3 },
				{ instanceId: 'i-catalog-2', name: 'catalog-2', weight: 1 },
			],
		],
	]),
	consumerIdBySlug: new Map(['web-app', 'mobile-app', 'partner-x', 'internal-batch'].map((slug) => [slug, `c-${slug}`])),
};

function synthesize(seed = 42, catalog: SynthesisCatalog = CATALOG) {
	const input: SynthesisInput = {
		catalog,
		nowMs: NOW,
		random: createSeededRandom(seed),
		hourOf: (timestampMs) => new Date(timestampMs).getUTCHours(),
	};

	return synthesizeTraffic(input);
}

// One small route: enough to compare runs without generating a full day
// of the whole catalog three times.
const SMALL_CATALOG: SynthesisCatalog = { ...CATALOG, routes: CATALOG.routes.filter((route) => route.pathPrefix === '/api/public/health') };

const history = synthesize();

function sum<T>(rows: readonly T[], field: (row: T) => number): number {
	return rows.reduce((total, row) => total + field(row), 0);
}

describe('synthesizeTraffic', () => {
	it('is the same for the same seed and different for another', () => {
		const total = (seed: number) => sum(synthesize(seed, SMALL_CATALOG).instanceSamples, (row) => row.requestCount);

		expect(total(42)).toBe(total(42));
		expect(total(7)).not.toBe(total(42));
	});

	it('covers the last 24 hours in 10 s buckets, marked as the seed', () => {
		const starts = history.instanceSamples.map((row) => row.bucketStart.getTime());

		expect(Math.max(...starts)).toBe(NOW - 3000 - 10_000);
		expect(Math.min(...starts)).toBe(NOW - 3000 - 24 * HOUR);
		expect(history.instanceSamples.every((row) => row.gatewayId === SEED_GATEWAY_ID && row.flushKey.startsWith('seed:'))).toBe(true);
		expect(new Set(history.instanceSamples.map((row) => row.flushKey)).size).toBe(history.instanceSamples.length);
	});

	it('keeps every histogram equal to its request count, on both tables', () => {
		const rows = [...history.instanceSamples, ...history.consumerSamples];

		expect(rows.every((row) => sum(row.latencyBuckets, (count) => count) === row.requestCount)).toBe(true);
		expect(sum(history.consumerSamples, (row) => row.requestCount)).toBe(sum(history.instanceSamples, (row) => row.requestCount));
	});

	it('follows the daily curve: busiest at 14 h, quietest at 4 h', () => {
		const inHour = (hour: number) =>
			sum(
				history.instanceSamples.filter((row) => row.bucketStart.getUTCHours() === hour),
				(row) => row.requestCount,
			);

		expect(inHour(14)).toBeGreaterThan(inHour(4) * 3);
		expect(dailyCurve(4)).toBeCloseTo(0.2);
		expect(dailyCurve(14)).toBeCloseTo(1);
	});

	it("ends at the live bot's rate, so the charts show no step where the bot takes over", () => {
		const lastFiveMinutesStart = NOW - 3000 - 5 * 60_000;
		const recentRequests = sum(
			history.instanceSamples.filter((row) => row.bucketStart.getTime() >= lastFiveMinutesStart),
			(row) => row.requestCount,
		);
		const recentRps = recentRequests / (5 * 60);

		expect(recentRps).toBeGreaterThan(DEMO_LIVE_RPS * 0.9);
		expect(recentRps).toBeLessThan(DEMO_LIVE_RPS * 1.1);
	});

	it('tells the story: orders-2 slow six hours ago, users-2 down two hours ago', () => {
		const slowStart = Math.floor((NOW - 6 * HOUR) / 10_000) * 10_000;
		const slowRows = history.instanceSamples.filter(
			(row) => row.instanceId === 'i-orders-2' && row.bucketStart.getTime() >= slowStart && row.bucketStart.getTime() < slowStart + 20 * 60_000,
		);
		const slowHistogram = slowRows.reduce<number[]>(
			(merged, row) => merged.map((count, index) => count + row.latencyBuckets[index]),
			Array(12).fill(0),
		);
		const outageStart = Math.floor((NOW - 2 * HOUR) / 10_000) * 10_000;
		const outageRows = history.instanceSamples.filter(
			(row) => row.bucketStart.getTime() >= outageStart && row.bucketStart.getTime() < outageStart + 5 * 60_000,
		);

		expect(percentileFromHistogram(slowHistogram, 0.95)).toBeGreaterThan(800);
		expect(outageRows.some((row) => row.instanceId === 'i-users-2')).toBe(false);
		expect(outageRows.some((row) => row.instanceId === 'i-users-1' && row.retryCount > 0)).toBe(true);
		expect(history.stateEvents.map((event) => `${event.kind}:${event.toState}`)).toEqual([
			'circuit:circuit_open',
			'health:unhealthy',
			'health:healthy',
			'circuit:circuit_half_open',
			'circuit:circuit_closed',
		]);
		expect(history.alerts.map((alert) => alert.kind)).toEqual(['route_p95_latency', 'circuit_open', 'instance_unhealthy']);
		expect(history.alerts.every((alert) => alert.resolvedAt > alert.triggeredAt)).toBe(true);
		expect(history.configChanges).toEqual([expect.objectContaining({ entityId: 'i-catalog-1', summary: 'weight 1 -> 3' })]);
	});

	it("rejects about the live bot's share of the traffic for partner-x at the end", () => {
		const lastFiveMinutesStart = NOW - 3000 - 5 * 60_000;
		const recentRows = history.instanceSamples.filter((row) => row.bucketStart.getTime() >= lastFiveMinutesStart);
		const rejectedShare = sum(recentRows, (row) => row.rateLimitedCount) / sum(recentRows, (row) => row.requestCount);

		expect(rejectedShare).toBeGreaterThan(0.04);
		expect(rejectedShare).toBeLessThan(0.08);
	});

	it('has partner-x hit its limit all day, before any instance', () => {
		const rejected = history.instanceSamples.filter((row) => row.instanceId === null);
		const partnerRows = history.consumerSamples.filter((row) => row.consumerId === 'c-partner-x');

		expect(sum(rejected, (row) => row.rateLimitedCount)).toBeGreaterThan(1000);
		expect(sum(partnerRows, (row) => row.rateLimitedCount)).toBe(sum(rejected, (row) => row.rateLimitedCount));
	});

	it('balances by weight and serves the public route anonymously', () => {
		const catalogCount = (instanceId: string) =>
			sum(
				history.instanceSamples.filter((row) => row.routeId === 'r-catalog' && row.instanceId === instanceId),
				(row) => row.requestCount,
			);
		const share = catalogCount('i-catalog-1') / (catalogCount('i-catalog-1') + catalogCount('i-catalog-2'));

		expect(share).toBeGreaterThan(0.72);
		expect(share).toBeLessThan(0.78);
		expect(history.consumerSamples.filter((row) => row.routeId === 'r-public').every((row) => row.consumerId === null)).toBe(true);
		expect(history.instanceSamples.some((row) => row.routeId === 'r-unknown')).toBe(false);
	});

	it('splits a count in whole parts that add up to it, by weight', () => {
		const random = createSeededRandom(3);
		const parts = splitCount(1000, [3, 1, 0], random);

		expect(parts.reduce((total, part) => total + part, 0)).toBe(1000);
		expect(parts[0] / 1000).toBeGreaterThan(0.65);
		expect(parts[0] / 1000).toBeLessThan(0.85);
		expect(parts[2]).toBe(0);
		expect(splitCount(7, [0, 0], random)).toEqual([0, 0]);
	});

	it('skips the story for instances the catalog does not have', () => {
		const bare: SynthesisCatalog = { routes: [], instancesByService: new Map(), consumerIdBySlug: new Map() };
		const empty = synthesizeTraffic({ catalog: bare, nowMs: NOW, random: createSeededRandom(1), hourOf: () => 12 });

		expect(empty).toEqual({ instanceSamples: [], consumerSamples: [], stateEvents: [], alerts: [], configChanges: [] });
	});
});
