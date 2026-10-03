import { describe, expect, it } from 'vitest';

import { computeMetricTrend } from './metricTrend';

describe('computeMetricTrend', () => {
	it('compares the latest value with the average of the ones before it', () => {
		expect(computeMetricTrend([100, 100, 120])).toEqual({ direction: 'up', percent: 20, ratio: 1.2 });
		expect(computeMetricTrend([100, null, 100, 75])).toEqual({ direction: 'down', percent: 25, ratio: 0.75 });
	});

	it('calls a change under 2% flat', () => {
		expect(computeMetricTrend([100, 100, 101])).toEqual({ direction: 'flat', percent: 1, ratio: 1.01 });
	});

	it('has no trend with too little history or a zero average', () => {
		expect(computeMetricTrend([null, 10, 20])).toBeNull();
		expect(computeMetricTrend([0, 0, 5])).toBeNull();
	});
});
