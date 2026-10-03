import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { buildMetricSparklineBars, type MetricSparklineBar, type MetricSparklineInput } from './buildMetricSparklineBars';
import { computeMetricTrend, type MetricTrend } from './metricTrend';
import { SPARKLINE_BOX, toAreaPath, toLinePath, toSparklineSegments } from './sparklineGeometry';

import './MetricTile.css';

type MetricTileProps = {
	readonly label: string;
	readonly values: readonly (number | null)[];
	readonly timestamps: readonly string[];
	readonly formatValue: (value: number) => string;
	// Off for rare-event counts (errors, 429s): from or to zero every percentage is noise.
	readonly hasTrend?: boolean;
};

type SparklineProps = { readonly bars: readonly MetricSparklineBar[] };

const TREND_ICONS = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;
// From double the average up, the chip shows a multiple instead of a percentage.
const MULTIPLE_FROM_RATIO = 2;
const MULTIPLE_FORMAT: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };

export function MetricTile({ label, values, timestamps, formatValue, hasTrend = true }: MetricTileProps): ReactElement {
	const { t, i18n } = useTranslation();
	const latest = latestDefinedValue(values);
	const sparklineInput: MetricSparklineInput = { values, timestamps, formatValue, locale: i18n.language, t };
	const bars = buildMetricSparklineBars(sparklineInput);
	const hasAnyData = bars.some((bar) => bar.hasValue);
	const trend = hasTrend ? computeMetricTrend(values) : null;

	return (
		<div className="metric-tile">
			<div className="metric-tile-head">
				<span className="metric-tile-label">{label}</span>
				{trend !== null && <TrendChip trend={trend} />}
			</div>
			<div className="metric-tile-value">{latest === null ? '-' : formatValue(latest)}</div>
			{hasAnyData ? <Sparkline bars={bars} /> : <div className="metric-tile-empty">{t('metricTile.noDataYet')}</div>}
		</div>
	);
}

// The direction is in the arrow and the words, never in a good/bad color: more requests
// is not worse, more latency is.
function TrendChip({ trend }: { readonly trend: MetricTrend }): ReactElement {
	const { t, i18n } = useTranslation();
	const Icon = TREND_ICONS[trend.direction];
	const text = trendText(trend, t('metricTile.trendFlat'), i18n.language);

	return (
		<span
			className={`metric-tile-trend is-${trend.direction}`}
			data-tooltip={t(`metricTile.trendTooltip.${trend.direction}`, { percent: trend.percent })}
		>
			<Icon size={12} aria-hidden="true" />
			{text}
		</span>
	);
}

// An area under a line; each sample keeps its own hover target with the reading.
function Sparkline({ bars }: SparklineProps): ReactElement {
	const gradientId = useId();
	const segments = toSparklineSegments(bars);
	const slotWidth = SPARKLINE_BOX / Math.max(bars.length, 1);
	const lastSegment = segments.at(-1);
	const lastPoint = lastSegment?.at(-1);

	return (
		<div className="metric-tile-sparkline">
			<svg viewBox={`0 0 ${SPARKLINE_BOX} ${SPARKLINE_BOX}`} preserveAspectRatio="none" aria-hidden="true">
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
						<stop offset="0%" className="metric-tile-area-top" />
						<stop offset="100%" className="metric-tile-area-bottom" />
					</linearGradient>
				</defs>
				{segments.map((points, index) => (
					<g key={index}>
						<path d={toAreaPath(points)} fill={`url(#${gradientId})`} />
						<path d={toLinePath(points)} className="metric-tile-line" vectorEffect="non-scaling-stroke" />
					</g>
				))}
				{bars.map((bar, index) => (
					<rect key={index} className="metric-tile-hit" x={index * slotWidth} y={0} width={slotWidth} height={SPARKLINE_BOX}>
						<title>{bar.tooltip}</title>
					</rect>
				))}
			</svg>
			{lastPoint && <span className="metric-tile-dot" style={{ left: `${lastPoint.x}%`, top: `${lastPoint.y}%` }} />}
		</div>
	);
}

function trendText(trend: MetricTrend, flatLabel: string, locale: string): string {
	if (trend.direction === 'flat') {
		return flatLabel;
	}

	if (trend.ratio >= MULTIPLE_FROM_RATIO) {
		return `×${trend.ratio.toLocaleString(locale, MULTIPLE_FORMAT)}`;
	}

	return `${trend.percent}%`;
}

function latestDefinedValue(values: readonly (number | null)[]): number | null {
	for (let index = values.length - 1; index >= 0; index--) {
		const value = values[index];

		if (value !== null) {
			return value;
		}
	}

	return null;
}
