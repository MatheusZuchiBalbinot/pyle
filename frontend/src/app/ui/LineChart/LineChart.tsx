import { useEffect, useId, useMemo, useRef, useState, type ReactElement, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';

import { useElementWidth } from '@/app/hooks/useElementWidth';
import { useTweenedDomain, type ChartDomain } from '@/app/hooks/useTweenedDomain';

import { CHART_SERIES_COLORS, MAX_CHART_SERIES } from './chartPalette';
import { pickVisibleEndLabels, type EndLabelCandidate } from './endLabels';
import { niceTicks, scaleLinear } from './scale';
import { computeTooltipStyle, type TooltipAnchor } from './tooltipPlacement';

import './LineChart.css';

export type LineChartPoint = {
	readonly at: number;
	readonly value: number;
};

export type LineChartSeries = {
	readonly id: string;
	readonly label: string;
	readonly points: readonly LineChartPoint[];
};

export type LineChartTimeDomain = { readonly from: number; readonly to: number };

export type LineChartProps = {
	readonly series: readonly LineChartSeries[];
	// The time axis: the window shown, whatever part of it has data.
	readonly timeDomain: LineChartTimeDomain;
	// Changes when the chart shows something else (another metric or window):
	// the plot is redrawn with an entrance instead of easing between scales.
	readonly transitionKey: string;
	readonly formatValue: (value: number) => string;
	readonly formatTime: (at: number) => string;
	readonly height?: number;
	readonly emptyLabel: string;
	// 1 for a count axis, so ticks never land on fractions of a unit.
	readonly minTickStep?: number;
	// New samples arrive live: the newest point of each line pulses.
	readonly isLive?: boolean;
};

const DEFAULT_HEIGHT_PX = 180;
const MARGIN = { top: 12, right: 64, bottom: 24, left: 44 } as const;
const LINE_WIDTH = 2;
const END_MARKER_RADIUS = 4;
const SURFACE_RING_WIDTH = 2;
const HOVER_TOLERANCE_MS = 5 * 60 * 1000;
const AREA_TOP_OPACITY = 0.28;

type Hover = {
	readonly at: number;
	readonly chartLeft: number;
	readonly chartTop: number;
};

type HoverRow = {
	readonly entry: LineChartSeries;
	readonly index: number;
	readonly point: LineChartPoint;
};

// Caps at the palette's slot count: extra series are not drawn.
export function LineChart({
	series,
	timeDomain,
	transitionKey,
	formatValue,
	formatTime,
	height = DEFAULT_HEIGHT_PX,
	emptyLabel,
	minTickStep = 0,
	isLive = false,
}: LineChartProps): ReactElement {
	const { t } = useTranslation();
	const clipId = useId();
	const areaGradientId = useId();
	const [hover, setHover] = useState<Hover | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);
	const width = useElementWidth(svgRef);

	const { drawnSeries, allPoints, targetDomain, ticks } = useMemo(() => {
		const drawn = series.slice(0, MAX_CHART_SERIES);
		const points = drawn.flatMap((entry) => entry.points);
		const values = points.map((point) => point.value);
		const computedTicks = niceTicks(values.length ? Math.max(...values) : 0, minTickStep);
		const domain: ChartDomain = {
			minAt: timeDomain.from,
			maxAt: timeDomain.to,
			maxValue: computedTicks[computedTicks.length - 1],
		};

		return { drawnSeries: drawn, allPoints: points, targetDomain: domain, ticks: computedTicks };
	}, [series, minTickStep, timeDomain.from, timeDomain.to]);
	const { minAt, maxAt, maxValue } = useTweenedDomain(targetDomain, transitionKey);
	const scaleX = scaleLinear(minAt, maxAt, MARGIN.left, Math.max(width - MARGIN.right, MARGIN.left + 1));
	const scaleY = scaleLinear(0, maxValue, height - MARGIN.bottom, MARGIN.top);
	// While the axis eases down, a tick above its current top would be drawn
	// over the header; it appears once the axis has grown into it.
	const visibleTicks = ticks.filter((tick) => tick <= maxValue);
	const hiddenSeriesCount = series.length - drawnSeries.length;
	const hasData = allPoints.length > 0;
	// One line gets a filled area; several would stack muddy fills over each other.
	const hasArea = drawnSeries.length === 1;

	function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>): void {
		if (!hasData) {
			return;
		}

		const rect = event.currentTarget.getBoundingClientRect();
		const x = event.clientX - rect.left;
		const at = minAt + ((x - MARGIN.left) / Math.max(width - MARGIN.left - MARGIN.right, 1)) * (maxAt - minAt);
		const snapped = closestPoint(allPoints, at);

		if (snapped === null) {
			return;
		}

		// The crosshair only moves between samples, so most pointer events land
		// on the same one — keep the current state and skip the re-render.
		setHover((current) => (current?.at === snapped.at ? current : { at: snapped.at, chartLeft: rect.left, chartTop: rect.top }));
	}

	function handlePointerLeave(): void {
		setHover(null);
	}

	// The portaled tooltip is positioned against the viewport; a scroll
	// would leave it floating where the chart used to be.
	const isHovering = hover !== null;

	useEffect(() => {
		if (!isHovering) {
			return;
		}

		function handleScroll(): void {
			setHover(null);
		}

		window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

		return () => window.removeEventListener('scroll', handleScroll, { capture: true });
	}, [isHovering]);

	if (!hasData) {
		return <div className="line-chart-empty">{emptyLabel}</div>;
	}

	const plotRight = width - MARGIN.right;
	const hoverRows = hover ? toHoverRows(drawnSeries, hover.at) : [];
	const crosshairX = hover ? scaleX(hover.at) : null;
	const tooltipAnchor: TooltipAnchor | null =
		hover && crosshairX !== null ? { chartLeft: hover.chartLeft, chartTop: hover.chartTop, chartWidth: width, crosshairX } : null;
	const visibleEndLabels = pickVisibleEndLabels(toEndLabelCandidates(drawnSeries, scaleY));

	return (
		<div className={`line-chart ${isLive ? 'is-live' : ''}`.trim()}>
			<svg
				ref={svgRef}
				className="line-chart-svg"
				width="100%"
				height={height}
				role="img"
				onPointerMove={handlePointerMove}
				onPointerLeave={handlePointerLeave}
			>
				<defs>
					<clipPath id={clipId}>
						<rect x={MARGIN.left} y={0} width={Math.max(plotRight - MARGIN.left, 0)} height={height} />
					</clipPath>
					<linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" stopColor={CHART_SERIES_COLORS[0]} stopOpacity={AREA_TOP_OPACITY} />
						<stop offset="100%" stopColor={CHART_SERIES_COLORS[0]} stopOpacity={0} />
					</linearGradient>
				</defs>
				<g key={transitionKey} className="line-chart-plot">
					{visibleTicks.map((tick) => (
						<g key={tick}>
							<line className="line-chart-grid" x1={MARGIN.left} x2={plotRight} y1={scaleY(tick)} y2={scaleY(tick)} />
							<text className="line-chart-tick" x={MARGIN.left - 6} y={scaleY(tick)} textAnchor="end" dominantBaseline="middle">
								{formatValue(tick)}
							</text>
						</g>
					))}
					<text className="line-chart-tick" x={MARGIN.left} y={height - 6}>
						{formatTime(minAt)}
					</text>
					<text className="line-chart-tick" x={plotRight} y={height - 6} textAnchor="end">
						{formatTime(maxAt)}
					</text>
					{drawnSeries.map((entry, index) => {
						const isEndLabelShown = visibleEndLabels.has(entry.id);
						const color = CHART_SERIES_COLORS[index];
						const path = entry.points
							.map((point, pointIndex) => `${pointIndex === 0 ? 'M' : 'L'}${scaleX(point.at)},${scaleY(point.value)}`)
							.join(' ');
						const last = entry.points[entry.points.length - 1];
						const first = entry.points[0];
						const baseline = scaleY(0);
						const areaPath = `${path} L${scaleX(last.at)},${baseline} L${scaleX(first.at)},${baseline} Z`;

						return (
							<g key={entry.id}>
								{hasArea && <path className="line-chart-area" d={areaPath} fill={`url(#${areaGradientId})`} clipPath={`url(#${clipId})`} />}
								<path
									className="line-chart-line"
									pathLength={1}
									d={path}
									fill="none"
									stroke={color}
									strokeWidth={LINE_WIDTH}
									strokeLinejoin="round"
									strokeLinecap="round"
									clipPath={`url(#${clipId})`}
								/>
								{last && (
									<>
										{isLive && (
											<circle cx={scaleX(last.at)} cy={scaleY(last.value)} r={END_MARKER_RADIUS} fill={color} className="line-chart-live-pulse" />
										)}
										<circle
											cx={scaleX(last.at)}
											cy={scaleY(last.value)}
											r={END_MARKER_RADIUS + SURFACE_RING_WIDTH}
											className="line-chart-ring line-chart-marker"
										/>
										<circle cx={scaleX(last.at)} cy={scaleY(last.value)} r={END_MARKER_RADIUS} fill={color} className="line-chart-marker" />
										{isEndLabelShown && (
											<text
												className="line-chart-end-label line-chart-marker"
												x={scaleX(last.at) + END_MARKER_RADIUS + 6}
												y={scaleY(last.value)}
												dominantBaseline="middle"
											>
												{formatValue(last.value)}
											</text>
										)}
									</>
								)}
							</g>
						);
					})}
				</g>
				{crosshairX !== null && <line className="line-chart-crosshair" x1={crosshairX} x2={crosshairX} y1={MARGIN.top} y2={height - MARGIN.bottom} />}
			</svg>
			{hover &&
				tooltipAnchor &&
				hoverRows.length > 0 &&
				createPortal(
					<div className="line-chart-tooltip" style={computeTooltipStyle(tooltipAnchor)}>
						<div className="line-chart-tooltip-time">{formatTime(hover.at)}</div>
						{hoverRows.map(({ entry, index, point }) => (
							<div key={entry.id} className="line-chart-tooltip-row">
								<span className="line-chart-key" style={{ background: CHART_SERIES_COLORS[index] }} />
								<strong>{formatValue(point.value)}</strong>
								<span className="muted">{entry.label}</span>
							</div>
						))}
					</div>,
					document.body,
				)}
			{drawnSeries.length > 1 && (
				<div className="line-chart-legend">
					{drawnSeries.map((entry, index) => (
						<span key={entry.id} className="line-chart-legend-item">
							<span className="line-chart-key" style={{ background: CHART_SERIES_COLORS[index] }} />
							{entry.label}
						</span>
					))}
					{hiddenSeriesCount > 0 && <span className="faint">{t('lineChart.hiddenSeries', { count: hiddenSeriesCount })}</span>}
				</div>
			)}
		</div>
	);
}

function closestPoint(points: readonly LineChartPoint[], at: number): LineChartPoint | null {
	let best: LineChartPoint | null = null;

	for (const point of points) {
		const isCloser = best === null || Math.abs(point.at - at) < Math.abs(best.at - at);

		if (isCloser) {
			best = point;
		}
	}

	return best;
}

// A series with no sample near the hovered time is left out of the tooltip
// rather than showing a reading from far away.
function nearestPoint(points: readonly LineChartPoint[], at: number): LineChartPoint | null {
	const best = closestPoint(points, at);

	if (best === null || Math.abs(best.at - at) > HOVER_TOLERANCE_MS) {
		return null;
	}

	return best;
}

function toEndLabelCandidates(drawnSeries: readonly LineChartSeries[], scaleY: (value: number) => number): readonly EndLabelCandidate[] {
	return drawnSeries.flatMap((entry) => {
		const last = entry.points.at(-1);

		return last === undefined ? [] : [{ seriesId: entry.id, y: scaleY(last.value) }];
	});
}

function toHoverRows(drawnSeries: readonly LineChartSeries[], at: number): readonly HoverRow[] {
	return drawnSeries.flatMap((entry, index) => {
		const point = nearestPoint(entry.points, at);

		return point ? [{ entry, index, point }] : [];
	});
}
