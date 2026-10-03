import { toBucketStart, TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';

import { createSeededRandom, dailyCurve } from './synthesize-traffic/daily-curve.js';
import { narrativeEvents, narrativeFor } from './synthesize-traffic/narrative.js';
import { synthesizeOutageRetries, synthesizePartnerOverflow, synthesizeRoute, toRows, TOTAL_PEAK_RPS } from './synthesize-traffic/row-builders.js';
import {
	HISTORY_HOURS,
	MS_PER_HOUR,
	SEED_GATEWAY_ID,
	type BucketContext,
	type ConsumerSampleRow,
	type InstanceSampleRow,
	type SynthesisCatalog,
	type SynthesisInput,
	type SyntheticHistory,
} from './synthesize-traffic/types.js';
import { DEMO_LIVE_RPS } from './demo-traffic.js';

// A daily curve, noise, and one story the Overview and the AI can tell. Pure: time and
// randomness come in, rows come out. The curve/noise generators live in
// ./synthesize-traffic/daily-curve.ts, the incident story in
// ./synthesize-traffic/narrative.ts, and the per-bucket row builders in
// ./synthesize-traffic/row-builders.ts; this file only wires them together.

export { createSeededRandom, dailyCurve, SEED_GATEWAY_ID, type SynthesisCatalog, type SynthesisInput, type SyntheticHistory };

export function synthesizeTraffic(input: SynthesisInput): SyntheticHistory {
	const narrative = narrativeFor(input.nowMs);
	const lastBucketMs = toBucketStart(input.nowMs) - TRAFFIC_BUCKET_MS;
	const firstBucketMs = lastBucketMs - HISTORY_HOURS * MS_PER_HOUR + TRAFFIC_BUCKET_MS;
	const instanceSamples: InstanceSampleRow[] = [];
	const consumerSamples: ConsumerSampleRow[] = [];
	// The day keeps its shape, scaled so its last bucket matches the live bot's rate.
	const curveScale = DEMO_LIVE_RPS / (TOTAL_PEAK_RPS * dailyCurve(input.hourOf(lastBucketMs)));

	for (let bucketStartMs = firstBucketMs; bucketStartMs <= lastBucketMs; bucketStartMs += TRAFFIC_BUCKET_MS) {
		const context: BucketContext = { input, narrative, bucketStartMs, rows: { instances: new Map(), consumers: new Map() } };
		const curve = dailyCurve(input.hourOf(bucketStartMs)) * curveScale;

		for (const route of input.catalog.routes) {
			synthesizeRoute(context, route, curve);
			synthesizePartnerOverflow(context, route, curve);
		}

		synthesizeOutageRetries(context);
		const rows = toRows(context);

		instanceSamples.push(...rows.instances);
		consumerSamples.push(...rows.consumers);
	}

	return { instanceSamples, consumerSamples, ...narrativeEvents(input.catalog, narrative) };
}
