import { describe, expect, it } from 'vitest';

import { LATENCY_HISTOGRAM_LENGTH } from '@pyle/shared/contracts/latency-histogram.js';

import type { CompletedRequest } from '../contracts/request-observer.js';
import { TrafficAggregator } from './traffic-aggregator.js';

const BASE: CompletedRequest = {
	requestId: 'r',
	startedAtMs: 10_000,
	finishedAtMs: 10_020,
	method: 'GET',
	path: '/api/orders',
	routeId: 'route-1',
	routeName: 'Pedidos',
	consumerId: 'consumer-1',
	consumerSlug: 'web',
	instanceId: 'instance-1',
	instanceName: 'orders-1',
	status: 200,
	attempts: 1,
	gatewayError: null,
};

function aggregate(requests: readonly Partial<CompletedRequest>[]) {
	const aggregator = new TrafficAggregator();

	for (const request of requests) {
		aggregator.onRequestCompleted({ ...BASE, ...request });
	}

	return aggregator;
}

describe('TrafficAggregator', () => {
	it('classifies each kind of response', () => {
		const requests: Partial<CompletedRequest>[] = [
			{ status: 200 },
			{ status: 304 },
			{ status: 404 },
			{ status: 499 },
			{ status: 500 },
			{ status: 429, gatewayError: 'rate_limited', instanceId: null },
			{ status: 503, gatewayError: 'no_healthy_instance', instanceId: null },
			{ status: 504, gatewayError: 'upstream_timeout', attempts: 2 },
			{ status: 429 },
			{ status: 101 },
		];

		const [bucket] = aggregate(requests).drainAll();
		const byInstance = new Map(bucket.instances.map((row) => [row.instanceId, row]));

		expect(byInstance.get('instance-1')).toMatchObject({
			requestCount: 8,
			status2xx: 1,
			status3xx: 1,
			status4xx: 3,
			status5xx: 2,
			rateLimitedCount: 0,
			gatewayErrorCount: 1,
			retryCount: 1,
		});
		expect(byInstance.get(null)).toMatchObject({ requestCount: 2, status4xx: 1, status5xx: 1, rateLimitedCount: 1, gatewayErrorCount: 1 });
		expect(bucket.consumers).toEqual([
			expect.objectContaining({ routeId: 'route-1', consumerId: 'consumer-1', requestCount: 10, status4xx: 4, status5xx: 3, rateLimitedCount: 1 }),
		]);
	});

	it('fills the latency histogram and sum', () => {
		const [bucket] = aggregate([{ finishedAtMs: 10_003 }, { finishedAtMs: 10_090 }, { finishedAtMs: 19_999 }]).drainAll();
		const [row] = bucket.instances;

		expect(row.latencyBuckets).toHaveLength(LATENCY_HISTOGRAM_LENGTH);
		expect(row.latencyBuckets.reduce((sum, count) => sum + count, 0)).toBe(3);
		expect(row.latencyBuckets[0]).toBe(1);
		expect(row.latencyBuckets[4]).toBe(1);
		expect(row.latencyBuckets.at(-1)).toBe(0);
		expect(row.latencySumMs).toBe(3 + 90 + 9999);
	});

	it('buckets by finish time, exact edge included', () => {
		const aggregator = aggregate([{ finishedAtMs: 19_999 }, { finishedAtMs: 20_000 }]);

		expect(aggregator.drainAll().map((bucket) => bucket.bucketStartMs)).toEqual([10_000, 20_000]);
	});

	it('drains only closed buckets, oldest first, and forgets them', () => {
		const aggregator = aggregate([{ finishedAtMs: 25_000 }, { finishedAtMs: 15_000 }, { finishedAtMs: 31_000 }]);

		expect(aggregator.drainClosedBuckets(30_000).map((bucket) => bucket.bucketStartMs)).toEqual([10_000, 20_000]);
		expect(aggregator.drainClosedBuckets(30_000)).toEqual([]);
		expect(aggregator.openBucketCount).toBe(1);
	});

	it('keeps unmatched and anonymous requests under null keys', () => {
		const [bucket] = aggregate([{ routeId: null, instanceId: null, consumerId: null, status: 404, gatewayError: 'route_not_found' }]).drainAll();

		expect(bucket.instances[0]).toMatchObject({ routeId: null, instanceId: null });
		expect(bucket.consumers[0]).toMatchObject({ routeId: null, consumerId: null });
	});

	it('never counts a negative latency', () => {
		const [bucket] = aggregate([{ startedAtMs: 10_050, finishedAtMs: 10_000 }]).drainAll();

		expect(bucket.instances[0].latencySumMs).toBe(0);
	});
});
