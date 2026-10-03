export type MetricTrend = {
	readonly direction: 'up' | 'down' | 'flat';
	readonly percent: number;
	// latest / average: past doubling, "x6.7" reads better than "569%".
	readonly ratio: number;
};

// Below this change the latest value reads as "at the average": noise, not a trend.
const FLAT_THRESHOLD_PERCENT = 2;
const PERCENT = 100;
const MIN_SAMPLES = 3;

// The latest value against the average of the samples before it. Null when there is
// too little history or the average is zero (no percentage to speak of).
export function computeMetricTrend(values: readonly (number | null)[]): MetricTrend | null {
	const defined = values.filter((value): value is number => value !== null);

	if (defined.length < MIN_SAMPLES) {
		return null;
	}

	const latest = defined[defined.length - 1];
	const earlier = defined.slice(0, -1);
	const average = earlier.reduce((sum, value) => sum + value, 0) / earlier.length;

	if (average === 0) {
		return null;
	}

	const ratio = latest / average;
	const percent = Math.round((ratio - 1) * PERCENT);

	return { direction: directionOf(percent), percent: Math.abs(percent), ratio };
}

function directionOf(percent: number): MetricTrend['direction'] {
	if (Math.abs(percent) < FLAT_THRESHOLD_PERCENT) {
		return 'flat';
	}

	return percent > 0 ? 'up' : 'down';
}
