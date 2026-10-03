import { describe, expect, it } from 'vitest';

import type { MetricSparklineBar } from './buildMetricSparklineBars';
import { toAreaPath, toLinePath, toSparklineSegments } from './sparklineGeometry';

function bar(heightPercent: number, hasValue = true): MetricSparklineBar {
	return { heightPercent, hasValue, tooltip: '' };
}

describe('toSparklineSegments', () => {
	it('spreads samples over the box and breaks the line at gaps', () => {
		const segments = toSparklineSegments([bar(50), bar(100), bar(6, false), bar(25), bar(75)]);

		expect(segments).toEqual([
			[
				{ x: 0, y: 50 },
				{ x: 25, y: 0 },
			],
			[
				{ x: 75, y: 75 },
				{ x: 100, y: 25 },
			],
		]);
	});

	it('closes the area down to the floor', () => {
		const points = [
			{ x: 0, y: 50 },
			{ x: 100, y: 20 },
		];

		expect(toLinePath(points)).toBe('M0,50 L100,20');
		expect(toAreaPath(points)).toBe('M0,50 L100,20 L100,100 L0,100 Z');
	});
});
