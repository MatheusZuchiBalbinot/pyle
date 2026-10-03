import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConsumerTraffic, TrafficWindowName } from '@/app/api/adminApiTypes';
import { TrafficChart } from '@/app/features/traffic/components/TrafficChart/TrafficChart';
import { TrafficTotalsTiles } from '@/app/features/traffic/components/TrafficTotalsTiles/TrafficTotalsTiles';
import { TrafficWindowPicker } from '@/app/features/traffic/components/TrafficWindowPicker/TrafficWindowPicker';
import { useLiveDataStatus } from '@/app/features/traffic/hooks/useLiveTraffic';
import type { AsyncResourceState } from '@/app/hooks/useAsyncResource';
import { formatCompactCount } from '@/app/lib/formatTraffic';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { toSharePercents } from '@/app/lib/sharePercents';

import './ConsumerUsagePanel.css';

export type ConsumerUsagePanelProps = {
	readonly traffic: AsyncResourceState<ConsumerTraffic>;
	readonly window: TrafficWindowName;
	readonly onWindowChange: (window: TrafficWindowName) => void;
};

type RouteUsage = ConsumerTraffic['routes'][number];

export function ConsumerUsagePanel({ traffic, window, onWindowChange }: ConsumerUsagePanelProps): ReactElement {
	const { t } = useTranslation();
	const liveStatus = useLiveDataStatus();
	const data = traffic.status === LOAD_STATUS.loaded ? traffic.data : null;
	const view = data === null ? null : { series: data.series, window: data.window };

	return (
		<section className="consumer-usage" aria-label={t('consumers.detail.usage')}>
			<div className="consumer-usage-head">
				<h3>{t('consumers.detail.usage')}</h3>
				<TrafficWindowPicker value={window} onChange={onWindowChange} />
			</div>
			{traffic.status === LOAD_STATUS.error && <p className="error-state">{traffic.message}</p>}
			<TrafficTotalsTiles traffic={view} />
			<TrafficChart traffic={view} isLive={liveStatus.state === 'live'} />
			{data !== null && data.routes.length > 0 && <RouteUsageBars routes={data.routes} />}
		</section>
	);
}

// Each route's share of the consumer's requests as a bar, with the count and its 429s.
function RouteUsageBars({ routes }: { readonly routes: readonly RouteUsage[] }): ReactElement {
	const { t } = useTranslation();
	const percents = toSharePercents(routes.map((route) => route.requestCount));

	return (
		<ul className="route-usage-list" aria-label={t('consumers.detail.routesUsage')}>
			{routes.map((route, index) => (
				<li key={route.routeId ?? 'none'} className="route-usage-row">
					<span className="route-usage-name">{route.name ?? t('consumers.detail.removedRoute')}</span>
					<span className="route-usage-bar" aria-hidden="true">
						<span className="route-usage-fill" style={{ width: `${percents[index]}%` }} />
					</span>
					<span className="route-usage-count mono">{formatCompactCount(route.requestCount)}</span>
					<span className={`route-usage-limited mono ${route.rateLimitedCount > 0 ? 'is-limited' : ''}`.trim()}>
						{t('consumers.detail.limitedCount', { count: formatCompactCount(route.rateLimitedCount) })}
					</span>
				</li>
			))}
		</ul>
	);
}
