import type { ReactElement } from 'react';

import { Skeleton } from '../Skeleton/Skeleton';

import './LineChart.css';

// Mirrors LineChart's own geometry (DEFAULT_HEIGHT_PX / MARGIN there) so
// the card is exactly as tall before and after the data lands.
const HEIGHT_PX = 180;
const MARGIN = { top: 12, right: 64, bottom: 24, left: 44 } as const;
const GRID_LINE_COUNT = 4;
const TICK_LABEL_WIDTH = '28px';
const TICK_LABEL_HEIGHT = '9px';

export function LineChartSkeleton(): ReactElement {
	const gridLines = Array.from({ length: GRID_LINE_COUNT }, (_, index) => gridLineTop(index));
	const plotWidthStyle = { left: MARGIN.left, right: MARGIN.right };
	// An <svg> is a replaced element: `left`+`right` don't stretch it the way
	// they do a <span>, so the plot box is sized explicitly.
	const plotBoxStyle = {
		left: MARGIN.left,
		top: MARGIN.top,
		width: `calc(100% - ${MARGIN.left + MARGIN.right}px)`,
		height: HEIGHT_PX - MARGIN.top - MARGIN.bottom,
	};

	return (
		<div className="line-chart line-chart-skeleton" style={{ height: HEIGHT_PX }} aria-busy="true">
			{gridLines.map((top) => (
				<span key={top} className="line-chart-skeleton-grid" style={{ ...plotWidthStyle, top }} />
			))}
			{gridLines.map((top) => (
				<span key={top} className="line-chart-skeleton-tick is-y" style={{ top }}>
					<Skeleton width={TICK_LABEL_WIDTH} height={TICK_LABEL_HEIGHT} />
				</span>
			))}
			<span className="line-chart-skeleton-tick is-x-start" style={{ left: MARGIN.left }}>
				<Skeleton width="34px" height={TICK_LABEL_HEIGHT} />
			</span>
			<span className="line-chart-skeleton-tick is-x-end" style={{ right: MARGIN.right }}>
				<Skeleton width="34px" height={TICK_LABEL_HEIGHT} />
			</span>
			<svg className="line-chart-skeleton-line" style={plotBoxStyle} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
				<path d="M0,70 C15,66 25,52 40,55 S65,40 80,38 S92,30 100,32" vectorEffect="non-scaling-stroke" />
			</svg>
		</div>
	);
}

function gridLineTop(index: number): number {
	const plotHeight = HEIGHT_PX - MARGIN.top - MARGIN.bottom;

	return MARGIN.top + (plotHeight * index) / (GRID_LINE_COUNT - 1);
}
