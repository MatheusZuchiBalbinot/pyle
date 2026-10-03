import type { TrafficPoint, TrafficWindow } from '@/app/api/adminApiTypes';

const MS_PER_SECOND = 1000;
// A step is complete once its buckets are flushed: its end, the gateway's
// flush grace, and a margin for the write.
const FLUSH_LAG_MS = 12_000;

// The series without its trailing steps still being filled: an unflushed
// step reads as a sudden drop at the right edge that never happened.
export function settledPoints(series: readonly TrafficPoint[], window: TrafficWindow): readonly TrafficPoint[] {
	const settledBefore = Date.parse(window.to) - FLUSH_LAG_MS;
	const stepMs = window.stepSeconds * MS_PER_SECOND;

	return series.filter((point) => Date.parse(point.at) + stepMs <= settledBefore);
}
