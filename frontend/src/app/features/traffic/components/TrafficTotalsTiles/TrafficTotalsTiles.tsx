import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { TrafficPoint, TrafficWindow } from '@/app/api/adminApiTypes';
import { settledPoints } from '@/app/features/traffic/lib/trafficSeries';
import { formatCompactCount, formatLatency, formatRate, formatRps } from '@/app/lib/formatTraffic';
import { MetricTile } from '@/app/ui/MetricTile/MetricTile';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import './TrafficTotalsTiles.css';

export type TrafficTotalsTilesProps = {
	// Null while loading.
	readonly traffic: { readonly series: readonly TrafficPoint[]; readonly window: TrafficWindow } | null;
};

type TileSpec = {
	readonly key: string;
	readonly labelKey: string;
	readonly valueOf: (point: TrafficPoint) => number | null;
	readonly format: (value: number) => string;
	readonly hasTrend: boolean;
};

const MAX_SPARKLINE_POINTS = 40;

const TILES: readonly TileSpec[] = [
	{ key: 'rps', labelKey: 'gateway.tiles.rps', valueOf: (point) => point.requestsPerSecond, format: (value) => formatRps(value), hasTrend: true },
	{ key: 'p95', labelKey: 'gateway.tiles.p95', valueOf: (point) => point.p95Ms, format: (value) => formatLatency(value), hasTrend: true },
	{ key: 'errors', labelKey: 'gateway.tiles.errorRate', valueOf: (point) => point.errorRate, format: (value) => formatRate(value), hasTrend: false },
	{
		key: 'rate-limited',
		labelKey: 'gateway.tiles.rateLimited',
		valueOf: (point) => point.rateLimitedCount,
		format: (value) => formatCompactCount(value),
		hasTrend: false,
	},
];

// Each tile shows the latest settled step, not the window's average.
export function TrafficTotalsTiles({ traffic }: TrafficTotalsTilesProps): ReactElement {
	const { t } = useTranslation();

	if (traffic === null) {
		return (
			<div className="traffic-tiles" data-state="loading">
				{TILES.map((tile) => (
					<Skeleton key={tile.key} height="112px" className="traffic-tile-skeleton" />
				))}
			</div>
		);
	}

	// The recent trend only: a whole 15-minute window of 10 s steps is too
	// many bars for a tile's width.
	const points = settledPoints(traffic.series, traffic.window).slice(-MAX_SPARKLINE_POINTS);
	const timestamps = points.map((point) => point.at);

	return (
		<div className="traffic-tiles">
			{TILES.map((tile) => (
				<MetricTile
					key={tile.key}
					label={t(tile.labelKey)}
					values={points.map(tile.valueOf)}
					timestamps={timestamps}
					formatValue={tile.format}
					hasTrend={tile.hasTrend}
				/>
			))}
		</div>
	);
}
