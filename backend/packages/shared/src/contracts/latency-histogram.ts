// Latency histograms with fixed bucket edges. Traffic samples store one
// counter per bucket; percentiles are computed at read time from the summed
// histograms (never by averaging percentiles). See ADR 7.
export const TRAFFIC_BUCKET_MS = 10_000;
export const TRAFFIC_LATENCY_BUCKET_BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000] as const;
// One counter per bound plus the overflow bucket (> last bound).
export const LATENCY_HISTOGRAM_LENGTH = TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.length + 1;

const PERCENTILE_DECIMALS_FACTOR = 10;

export type LatencyHistogram = readonly number[];

export function emptyHistogram(): number[] {
	return Array.from({ length: LATENCY_HISTOGRAM_LENGTH }, () => 0);
}

export function bucketIndexFor(latencyMs: number): number {
	const index = TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.findIndex((bound) => latencyMs <= bound);

	if (index === -1) {
		return TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.length;
	}

	return index;
}

export function mergeHistograms(histograms: readonly LatencyHistogram[]): number[] {
	const merged = emptyHistogram();

	for (const histogram of histograms) {
		histogram.forEach((count, index) => {
			merged[index] = (merged[index] ?? 0) + count;
		});
	}

	return merged;
}

// Interpolates inside the target bucket; a target in the overflow bucket answers the last
// bound.
export function percentileFromHistogram(histogram: LatencyHistogram, percentile: number): number | null {
	const total = histogram.reduce((sum, count) => sum + count, 0);

	if (total === 0) {
		return null;
	}

	const target = percentile * total;
	const lastBound = TRAFFIC_LATENCY_BUCKET_BOUNDS_MS[TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.length - 1] ?? 0;
	let cumulativeBefore = 0;

	for (let index = 0; index < histogram.length; index++) {
		const count = histogram[index] ?? 0;
		const cumulative = cumulativeBefore + count;
		const isTargetBucket = count > 0 && cumulative >= target;

		if (isTargetBucket) {
			const isOverflowBucket = index >= TRAFFIC_LATENCY_BUCKET_BOUNDS_MS.length;

			if (isOverflowBucket) {
				return lastBound;
			}

			const lower = lowerBoundOf(index);
			const upper = TRAFFIC_LATENCY_BUCKET_BOUNDS_MS[index] ?? lastBound;
			const fraction = (target - cumulativeBefore) / count;

			return roundToOneDecimal(lower + fraction * (upper - lower));
		}

		cumulativeBefore = cumulative;
	}

	return lastBound;
}

export function toBucketStart(timestampMs: number): number {
	return Math.floor(timestampMs / TRAFFIC_BUCKET_MS) * TRAFFIC_BUCKET_MS;
}

function lowerBoundOf(index: number): number {
	if (index === 0) {
		return 0;
	}

	return TRAFFIC_LATENCY_BUCKET_BOUNDS_MS[index - 1] ?? 0;
}

function roundToOneDecimal(value: number): number {
	return Math.round(value * PERCENTILE_DECIMALS_FACTOR) / PERCENTILE_DECIMALS_FACTOR;
}
