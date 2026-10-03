import { GATEWAY_FAILURE_CODES } from '@pyle/shared/contracts/gateway-error.js';
import { bucketIndexFor, emptyHistogram, toBucketStart, TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';

import type { CompletedRequest, RequestObserver } from '../contracts/request-observer.js';
import { dimensionKey } from './sample-key.js';

const STATUS_CLASS_SIZE = 100;
const RATE_LIMITED_ERROR = 'rate_limited';

// One route × instance row of a bucket (RouteInstanceSample).
export type InstanceCounters = {
	readonly routeId: string | null;
	readonly instanceId: string | null;
	requestCount: number;
	status2xx: number;
	status3xx: number;
	status4xx: number;
	status5xx: number;
	rateLimitedCount: number;
	gatewayErrorCount: number;
	retryCount: number;
	readonly latencyBuckets: number[];
	latencySumMs: number;
};

// One route × consumer row of a bucket (RouteConsumerSample).
export type ConsumerCounters = {
	readonly routeId: string | null;
	readonly consumerId: string | null;
	requestCount: number;
	status4xx: number;
	status5xx: number;
	rateLimitedCount: number;
	readonly latencyBuckets: number[];
	latencySumMs: number;
};

export type TrafficBucket = {
	readonly bucketStartMs: number;
	readonly instances: readonly InstanceCounters[];
	readonly consumers: readonly ConsumerCounters[];
};

type OpenBucket = {
	readonly instances: Map<string, InstanceCounters>;
	readonly consumers: Map<string, ConsumerCounters>;
};

type StatusClass = 2 | 3 | 4 | 5 | null;

type Measured = {
	readonly statusClass: StatusClass;
	readonly isRateLimited: boolean;
	readonly latencyMs: number;
	readonly latencyIndex: number;
};

// Counters are mutated in place on purpose: this runs once per request on the hot path.
export class TrafficAggregator implements RequestObserver {
	private readonly buckets = new Map<number, OpenBucket>();

	onRequestCompleted(request: CompletedRequest): void {
		const bucket = this.bucketFor(toBucketStart(request.finishedAtMs));
		const latencyMs = Math.max(0, request.finishedAtMs - request.startedAtMs);
		const measured: Measured = {
			statusClass: statusClassOf(request.status),
			isRateLimited: request.gatewayError === RATE_LIMITED_ERROR,
			latencyMs,
			latencyIndex: bucketIndexFor(latencyMs),
		};
		const instanceKey = dimensionKey(request.routeId, request.instanceId);
		const instance = bucket.instances.get(instanceKey) ?? newInstanceCounters(request.routeId, request.instanceId);

		bucket.instances.set(instanceKey, instance);
		countInstance(instance, request, measured);
		const consumerKey = dimensionKey(request.routeId, request.consumerId);
		const consumer = bucket.consumers.get(consumerKey) ?? newConsumerCounters(request.routeId, request.consumerId);

		bucket.consumers.set(consumerKey, consumer);
		countConsumer(consumer, measured);
	}

	// Hands over (and forgets) every bucket that ended at or before now.
	drainClosedBuckets(nowMs: number): readonly TrafficBucket[] {
		return this.drain((bucketStartMs) => bucketStartMs + TRAFFIC_BUCKET_MS <= nowMs);
	}

	// Everything, the open bucket included (shutdown).
	drainAll(): readonly TrafficBucket[] {
		return this.drain(() => true);
	}

	get openBucketCount(): number {
		return this.buckets.size;
	}

	private bucketFor(bucketStartMs: number): OpenBucket {
		const existing = this.buckets.get(bucketStartMs);

		if (existing) {
			return existing;
		}

		const bucket: OpenBucket = { instances: new Map(), consumers: new Map() };

		this.buckets.set(bucketStartMs, bucket);

		return bucket;
	}

	private drain(shouldDrain: (bucketStartMs: number) => boolean): readonly TrafficBucket[] {
		const drained: TrafficBucket[] = [];

		for (const [bucketStartMs, bucket] of this.buckets) {
			if (!shouldDrain(bucketStartMs)) {
				continue;
			}

			this.buckets.delete(bucketStartMs);
			drained.push({ bucketStartMs, instances: [...bucket.instances.values()], consumers: [...bucket.consumers.values()] });
		}

		return drained.sort((left, right) => left.bucketStartMs - right.bucketStartMs);
	}
}

// A client that went away (499) lands in 4xx like any other 4xx.
function statusClassOf(status: number): StatusClass {
	const statusClass = Math.floor(status / STATUS_CLASS_SIZE);

	if (statusClass === 2 || statusClass === 3 || statusClass === 4 || statusClass === 5) {
		return statusClass;
	}

	return null;
}

function newInstanceCounters(routeId: string | null, instanceId: string | null): InstanceCounters {
	return {
		routeId,
		instanceId,
		requestCount: 0,
		status2xx: 0,
		status3xx: 0,
		status4xx: 0,
		status5xx: 0,
		rateLimitedCount: 0,
		gatewayErrorCount: 0,
		retryCount: 0,
		latencyBuckets: emptyHistogram(),
		latencySumMs: 0,
	};
}

function newConsumerCounters(routeId: string | null, consumerId: string | null): ConsumerCounters {
	return { routeId, consumerId, requestCount: 0, status4xx: 0, status5xx: 0, rateLimitedCount: 0, latencyBuckets: emptyHistogram(), latencySumMs: 0 };
}

function countInstance(counters: InstanceCounters, request: CompletedRequest, measured: Measured): void {
	counters.requestCount++;

	if (measured.statusClass === 2) {
		counters.status2xx++;
	}

	if (measured.statusClass === 3) {
		counters.status3xx++;
	}

	if (measured.statusClass === 4) {
		counters.status4xx++;
	}

	if (measured.statusClass === 5) {
		counters.status5xx++;
	}

	if (measured.isRateLimited) {
		counters.rateLimitedCount++;
	}

	const isGatewayFailure = request.gatewayError !== null && GATEWAY_FAILURE_CODES.has(request.gatewayError);

	if (isGatewayFailure) {
		counters.gatewayErrorCount++;
	}

	counters.retryCount += Math.max(0, request.attempts - 1);
	counters.latencyBuckets[measured.latencyIndex]++;
	counters.latencySumMs += measured.latencyMs;
}

function countConsumer(counters: ConsumerCounters, measured: Measured): void {
	counters.requestCount++;

	if (measured.statusClass === 4) {
		counters.status4xx++;
	}

	if (measured.statusClass === 5) {
		counters.status5xx++;
	}

	if (measured.isRateLimited) {
		counters.rateLimitedCount++;
	}

	counters.latencyBuckets[measured.latencyIndex]++;
	counters.latencySumMs += measured.latencyMs;
}
