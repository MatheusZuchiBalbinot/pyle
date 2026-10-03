import { emptyHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import { ANSWERED_STATUS_SHARES, ANSWERED_STATUSES, requestsIn, splitCount, statusFieldOf } from './daily-curve.js';
import { DOWN_INSTANCE, OUTAGE_RETRIED_REQUESTS, SLOW_INSTANCE } from './narrative.js';
import {
	SEED_GATEWAY_ID,
	type BucketContext,
	type ConsumerSampleRow,
	type Counts,
	type InstanceSampleRow,
	type Random,
	type RecordedBatch,
	type RouteTraffic,
	type SynthesisInstance,
	type SynthesisRoute,
} from './types.js';

// Turns one bucket's traffic (requests per route, who serves them, who
// sends them) into the instance and consumer sample rows the seed writes.

const SEED_FLUSH_KEY_PREFIX = 'seed:';

// Per route prefix: requests per second at the daily peak, and who sends them. Only the
// proportions matter (synthesizeTraffic scales the day to end at the live bot's mean
// rate); they follow the bot's route mix: 41% orders, 28% users, 30% catalog, 1% public.
const ROUTE_TRAFFIC: Readonly<Record<string, RouteTraffic>> = {
	'/api/orders': {
		peakRps: 41,
		consumers: [
			{ slug: 'web-app', share: 0.6 },
			{ slug: 'mobile-app', share: 0.3 },
			{ slug: 'internal-batch', share: 0.1 },
		],
	},
	'/api/users': {
		peakRps: 28,
		consumers: [
			{ slug: 'web-app', share: 0.5 },
			{ slug: 'mobile-app', share: 0.4 },
			{ slug: 'internal-batch', share: 0.1 },
		],
	},
	// partner-x's share is what its limit lets through, as with the live bot.
	'/api/catalog': {
		peakRps: 30,
		consumers: [
			{ slug: 'web-app', share: 0.5 },
			{ slug: 'partner-x', share: 0.12 },
			{ slug: 'internal-batch', share: 0.38 },
		],
	},
	'/api/public/health': { peakRps: 1, consumers: [{ slug: null, share: 1 }] },
};

// Chance of each latency bucket.
const NORMAL_LATENCY: readonly number[] = [0.04, 0.3, 0.46, 0.13, 0.05, 0.015, 0.005, 0, 0, 0, 0, 0];
const SLOW_LATENCY: readonly number[] = [0, 0, 0.01, 0.02, 0.03, 0.05, 0.09, 0.2, 0.55, 0.05, 0, 0];
// A representative latency per bucket, for latencySumMs.
const BUCKET_MIDPOINT_MS: readonly number[] = [3, 8, 17, 37, 75, 175, 375, 750, 1750, 3750, 7500, 12_000];

const HTTP_TOO_MANY_REQUESTS = 429;

// Requests per second partner-x sends past its limit, all answered 429: about 6% of
// the traffic, the live bot's share at its mean rate.
const PARTNER_OVERFLOW_RPS = 6;
const PARTNER_SLUG = 'partner-x';
const PARTNER_PREFIX = '/api/catalog';

// Requests per second across every route at the daily peak, partner-x's overflow included.
export const TOTAL_PEAK_RPS = Object.values(ROUTE_TRAFFIC).reduce((total, traffic) => total + traffic.peakRps, PARTNER_OVERFLOW_RPS);

export function synthesizeRoute(context: BucketContext, route: SynthesisRoute, curve: number): void {
	const traffic = ROUTE_TRAFFIC[route.pathPrefix];

	if (!traffic) {
		return;
	}

	const { random, catalog } = context.input;
	const instances = servingInstances(context, route);

	if (instances.length === 0) {
		return;
	}

	const instanceWeights = instances.map((instance) => instance.weight);
	const consumerWeights = traffic.consumers.map((consumer) => consumer.share);
	const count = requestsIn(traffic.peakRps, curve, random);
	const perInstance = splitCount(count, instanceWeights, random);

	for (const [instanceIndex, instanceCount] of perInstance.entries()) {
		const instance = instances[instanceIndex];
		const latencyProfile = latencyProfileFor(context, route, instance);
		const perConsumer = splitCount(instanceCount, consumerWeights, random);

		for (const [consumerIndex, consumerCount] of perConsumer.entries()) {
			if (consumerCount === 0) {
				continue;
			}

			const consumer = traffic.consumers[consumerIndex];
			const consumerId = consumer.slug === null ? null : (catalog.consumerIdBySlug.get(consumer.slug) ?? null);
			const batch = answeredBatch(consumerCount, latencyProfile, random);

			record(instanceCounts(context, route.routeId, instance.instanceId), batch);
			record(consumerCounts(context, route.routeId, consumerId), batch);
		}
	}
}

// partner-x keeps sending past its limit: answered 429 by the gateway,
// before any instance.
export function synthesizePartnerOverflow(context: BucketContext, route: SynthesisRoute, curve: number): void {
	if (route.pathPrefix !== PARTNER_PREFIX) {
		return;
	}

	const partnerId = context.input.catalog.consumerIdBySlug.get(PARTNER_SLUG) ?? null;
	const count = requestsIn(PARTNER_OVERFLOW_RPS, curve, context.input.random);

	if (count === 0) {
		return;
	}

	// Answered at once: all in the fastest latency bucket.
	const latencyCounts = emptyHistogram().map((_, index) => (index === 0 ? count : 0));
	const rejected: RecordedBatch = { statusCounts: [[HTTP_TOO_MANY_REQUESTS, count]], latencyCounts, rateLimitedCount: count };

	record(instanceCounts(context, route.routeId, null), rejected);
	record(consumerCounts(context, route.routeId, partnerId), rejected);
}

// The first bucket of the outage: users-2 refuses connections and the GETs
// sent to it are retried on users-1.
export function synthesizeOutageRetries(context: BucketContext): void {
	if (context.bucketStartMs !== context.narrative.outageStartMs) {
		return;
	}

	const users = context.input.catalog.routes.find((route) => route.serviceSlug === DOWN_INSTANCE.service);
	const survivor = (context.input.catalog.instancesByService.get(DOWN_INSTANCE.service) ?? []).find(
		(instance) => instance.name !== DOWN_INSTANCE.name,
	);

	if (!users || !survivor) {
		return;
	}

	instanceCounts(context, users.routeId, survivor.instanceId).retryCount += OUTAGE_RETRIED_REQUESTS;
}

export function toRows(context: BucketContext): { readonly instances: InstanceSampleRow[]; readonly consumers: ConsumerSampleRow[] } {
	const bucketStart = new Date(context.bucketStartMs);
	const base = { gatewayId: SEED_GATEWAY_ID, bucketStart };
	const instances = [...context.rows.instances.values()].map(({ routeId, instanceId, counts }) => ({
		...base,
		flushKey: `${SEED_FLUSH_KEY_PREFIX}${context.bucketStartMs}:${routeId}:${instanceId ?? 'none'}`,
		routeId,
		instanceId,
		...counts,
	}));
	const consumers = [...context.rows.consumers.values()].map(({ routeId, consumerId, counts }) => {
		const { status2xx: _ok, status3xx: _redirect, gatewayErrorCount: _gateway, retryCount: _retry, ...consumerCounts } = counts;

		return {
			...base,
			flushKey: `${SEED_FLUSH_KEY_PREFIX}${context.bucketStartMs}:${routeId}:${consumerId ?? 'none'}`,
			routeId,
			consumerId,
			...consumerCounts,
		};
	});

	return { instances, consumers };
}

function emptyCounts(): Counts {
	return {
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

function answeredBatch(count: number, latencyProfile: readonly number[], random: Random): RecordedBatch {
	const perStatus = splitCount(count, ANSWERED_STATUS_SHARES, random);
	const statusCounts = ANSWERED_STATUSES.map((status, index) => [status, perStatus[index]] as const);
	const latencyCounts = splitCount(count, latencyProfile, random);

	return { statusCounts, latencyCounts, rateLimitedCount: 0 };
}

function record(counts: Counts, batch: RecordedBatch): void {
	for (const [status, count] of batch.statusCounts) {
		counts[statusFieldOf(status)] += count;
	}

	for (const [index, count] of batch.latencyCounts.entries()) {
		counts.requestCount += count;
		counts.latencyBuckets[index] += count;
		counts.latencySumMs += count * (BUCKET_MIDPOINT_MS[index] ?? 0);
	}

	counts.rateLimitedCount += batch.rateLimitedCount;
}

function instanceCounts(context: BucketContext, routeId: string, instanceId: string | null): Counts {
	const key = `${routeId}|${instanceId}`;
	const existing = context.rows.instances.get(key);

	if (existing) {
		return existing.counts;
	}

	const created = { routeId, instanceId, counts: emptyCounts() };

	context.rows.instances.set(key, created);

	return created.counts;
}

function consumerCounts(context: BucketContext, routeId: string, consumerId: string | null): Counts {
	const key = `${routeId}|${consumerId}`;
	const existing = context.rows.consumers.get(key);

	if (existing) {
		return existing.counts;
	}

	const created = { routeId, consumerId, counts: emptyCounts() };

	context.rows.consumers.set(key, created);

	return created.counts;
}

function isWithin(timestampMs: number, startMs: number, endMs: number): boolean {
	return timestampMs >= startMs && timestampMs < endMs;
}

// Which instances take traffic in this bucket: the outage takes users-2 out.
function servingInstances(context: BucketContext, route: SynthesisRoute): readonly SynthesisInstance[] {
	const instances = context.input.catalog.instancesByService.get(route.serviceSlug) ?? [];
	const isOutage =
		route.serviceSlug === DOWN_INSTANCE.service && isWithin(context.bucketStartMs, context.narrative.outageStartMs, context.narrative.outageEndMs);

	if (!isOutage) {
		return instances;
	}

	return instances.filter((instance) => instance.name !== DOWN_INSTANCE.name);
}

function latencyProfileFor(context: BucketContext, route: SynthesisRoute, instance: SynthesisInstance): readonly number[] {
	const isSlow =
		route.pathPrefix === SLOW_INSTANCE.prefix &&
		instance.name === SLOW_INSTANCE.name &&
		isWithin(context.bucketStartMs, context.narrative.slowStartMs, context.narrative.slowEndMs);

	return isSlow ? SLOW_LATENCY : NORMAL_LATENCY;
}
