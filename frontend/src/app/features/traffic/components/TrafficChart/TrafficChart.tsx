import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { TrafficPoint, TrafficWindow } from '@/app/api/adminApiTypes';
import { chartTransitionKey } from '@/app/features/traffic/lib/chartTransitionKey';
import { settledPoints } from '@/app/features/traffic/lib/trafficSeries';
import { formatClockTime } from '@/app/lib/format';
import { formatLatency, formatRate, formatRps } from '@/app/lib/formatTraffic';
import { LineChart, type LineChartSeries } from '@/app/ui/LineChart/LineChart';
import { PillGroup, type PillOption } from '@/app/ui/PillGroup/PillGroup';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import './TrafficChart.css';

export type TrafficChartMetric = 'requests' | 'latency' | 'errors';

export type TrafficChartProps = {
	// Null while loading.
	readonly traffic: { readonly series: readonly TrafficPoint[]; readonly window: TrafficWindow } | null;
	readonly isLive: boolean;
};

type ChartSummary = { readonly average: number; readonly peak: number };

type SeriesSpec = { readonly id: string; readonly labelKey: string; readonly valueOf: (point: TrafficPoint) => number | null };

const METRICS: readonly TrafficChartMetric[] = ['requests', 'latency', 'errors'];
const CHART_HEIGHT = 260;

// One unit per metric, one axis: latency's three percentiles share
// milliseconds; nothing else is mixed in.
const SERIES_BY_METRIC: Readonly<Record<TrafficChartMetric, readonly SeriesSpec[]>> = {
	requests: [{ id: 'rps', labelKey: 'gateway.chart.rps', valueOf: (point) => point.requestsPerSecond }],
	latency: [
		{ id: 'p50', labelKey: 'gateway.chart.p50', valueOf: (point) => point.p50Ms },
		{ id: 'p95', labelKey: 'gateway.chart.p95', valueOf: (point) => point.p95Ms },
		{ id: 'p99', labelKey: 'gateway.chart.p99', valueOf: (point) => point.p99Ms },
	],
	errors: [{ id: 'error-rate', labelKey: 'gateway.chart.errorRate', valueOf: (point) => point.errorRate }],
};

// The line the summary above the chart describes: latency's p95, the alerting percentile.
const HEADLINE_SERIES_BY_METRIC: Readonly<Record<TrafficChartMetric, string>> = { requests: 'rps', latency: 'p95', errors: 'error-rate' };

// The smallest axis step per metric: an error rate that is all zeros reads
// 0-1%, not 0-100%.
const MIN_TICK_STEP_BY_METRIC: Readonly<Record<TrafficChartMetric, number>> = { requests: 0, latency: 0, errors: 0.01 };

const FORMAT_BY_METRIC: Readonly<Record<TrafficChartMetric, (value: number) => string>> = {
	requests: (value) => formatRps(value),
	latency: (value) => formatLatency(value),
	errors: (value) => formatRate(value),
};

export function TrafficChart({ traffic, isLive }: TrafficChartProps): ReactElement {
	const { t, i18n } = useTranslation();
	const [metric, setMetric] = useState<TrafficChartMetric>('requests');
	const options: readonly PillOption<TrafficChartMetric>[] = METRICS.map((value) => ({
		value,
		label: t(`gateway.chart.${value}`),
		tooltip: t(`gateway.chart.${value}Tooltip`),
	}));

	const points = traffic === null ? [] : settledPoints(traffic.series, traffic.window);
	const series = SERIES_BY_METRIC[metric].map((spec) => toSeries(points, spec, t(spec.labelKey)));
	const headline = summarize(series, HEADLINE_SERIES_BY_METRIC[metric]);

	function renderChart(): ReactElement {
		if (traffic === null) {
			return <Skeleton height={`${CHART_HEIGHT}px`} />;
		}

		const formatTime = (at: number): string => formatClockTime(at, i18n.language);
		const timeDomain = { from: Date.parse(traffic.window.from), to: Date.parse(traffic.window.to) };
		const transitionKey = chartTransitionKey(metric, traffic.window);

		return (
			<LineChart
				series={series}
				timeDomain={timeDomain}
				transitionKey={transitionKey}
				minTickStep={MIN_TICK_STEP_BY_METRIC[metric]}
				formatValue={FORMAT_BY_METRIC[metric]}
				formatTime={formatTime}
				height={CHART_HEIGHT}
				emptyLabel={t('gateway.chart.empty')}
				isLive={isLive}
			/>
		);
	}

	return (
		<div className="traffic-chart">
			<div className="traffic-chart-toolbar">
				<div className="traffic-chart-summary">
					<span className="traffic-chart-summary-label">{t(`gateway.chart.summary.${metric}`)}</span>
					{headline !== null && (
						<span className="traffic-chart-summary-values">
							<span>
								{t('gateway.chart.average')} <strong>{FORMAT_BY_METRIC[metric](headline.average)}</strong>
							</span>
							<span>
								{t('gateway.chart.peak')} <strong>{FORMAT_BY_METRIC[metric](headline.peak)}</strong>
							</span>
						</span>
					)}
				</div>
				<PillGroup options={options} value={metric} onChange={setMetric} ariaLabel={t('gateway.chart.metric')} />
			</div>
			{renderChart()}
		</div>
	);
}

function toSeries(points: readonly TrafficPoint[], spec: SeriesSpec, label: string): LineChartSeries {
	const chartPoints = points.flatMap((point) => {
		const value = spec.valueOf(point);

		return value === null ? [] : [{ at: Date.parse(point.at), value }];
	});

	return { id: spec.id, label, points: chartPoints };
}

function summarize(series: readonly LineChartSeries[], seriesId: string): ChartSummary | null {
	const values = series.find((entry) => entry.id === seriesId)?.points.map((point) => point.value) ?? [];

	if (values.length === 0) {
		return null;
	}

	const average = values.reduce((sum, value) => sum + value, 0) / values.length;

	return { average, peak: Math.max(...values) };
}
