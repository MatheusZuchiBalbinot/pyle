import type { MetricSparklineBar } from './buildMetricSparklineBars';

export type SparklinePoint = { readonly x: number; readonly y: number };

// The sparkline draws in a 0-100 box; the SVG stretches it to the tile.
export const SPARKLINE_BOX = 100;

// Runs of samples with a value, each drawn as its own line: a gap is a break, not a dip.
export function toSparklineSegments(bars: readonly MetricSparklineBar[]): readonly (readonly SparklinePoint[])[] {
	const segments: SparklinePoint[][] = [];
	const lastIndex = Math.max(bars.length - 1, 1);
	let current: SparklinePoint[] = [];

	bars.forEach((bar, index) => {
		if (!bar.hasValue) {
			current = [];

			return;
		}

		if (current.length === 0) {
			segments.push(current);
		}

		current.push({ x: (index / lastIndex) * SPARKLINE_BOX, y: SPARKLINE_BOX - bar.heightPercent });
	});

	return segments;
}

export function toLinePath(points: readonly SparklinePoint[]): string {
	return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ');
}

export function toAreaPath(points: readonly SparklinePoint[]): string {
	const first = points[0];
	const last = points[points.length - 1];

	return `${toLinePath(points)} L${last.x},${SPARKLINE_BOX} L${first.x},${SPARKLINE_BOX} Z`;
}
