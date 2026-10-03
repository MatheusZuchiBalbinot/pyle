import { Route as RouteIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AdminOverview } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useNow } from '@/app/hooks/useNow';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { DashboardCard } from '@/app/ui/DashboardCard/DashboardCard';
import { DashboardSkeleton } from '@/app/ui/DashboardSkeleton/DashboardSkeleton';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';

import { SystemHealthPanel } from '../settings/components/SystemHealthPanel/SystemHealthPanel';
import { LiveChartNote } from '../traffic/components/LiveChartNote/LiveChartNote';
import { TrafficChart } from '../traffic/components/TrafficChart/TrafficChart';
import { TrafficTotalsTiles } from '../traffic/components/TrafficTotalsTiles/TrafficTotalsTiles';
import { useLiveDataStatus } from '../traffic/hooks/useLiveTraffic';
import { GatewayAlertsList } from './components/GatewayAlertsList/GatewayAlertsList';
import { GatewayStatusPanel } from './components/GatewayStatusPanel/GatewayStatusPanel';
import { OverviewAttentionBanner } from './components/OverviewAttentionBanner/OverviewAttentionBanner';
import { RecentChangesPanel } from './components/RecentChangesPanel/RecentChangesPanel';
import { ServiceHealthGrid } from './components/ServiceHealthGrid/ServiceHealthGrid';
import { useOverview } from './hooks/useOverview';
import { buildAttentionItems } from './lib/overviewAttention';

import './OverviewPage.css';

const RELATIVE_TIME_TICK_MS = 30_000;

type OverviewBodyProps = { readonly overview: AdminOverview };

export function OverviewPage(): ReactElement {
	const { t } = useTranslation();
	const { loadState } = useOverview();

	function renderBody(): ReactElement {
		if (loadState.status === LOAD_STATUS.loading) {
			const cards = [
				{ name: 'overview-traffic-chart', title: t('overviewPage.cards.traffic'), span: 4, content: 'line-chart' },
				{ name: 'overview-health', title: t('overviewPage.cards.instances'), span: 2, content: 'bar-list' },
			] as const;

			return <DashboardSkeleton pageName="overview" cards={cards} />;
		}

		if (loadState.status === LOAD_STATUS.error) {
			return <div className="card error-state overview-error">{loadState.message}</div>;
		}

		return <OverviewBody overview={loadState.data} />;
	}

	return (
		<div className="page" data-page="overview">
			<PageHeader title={t('overviewPage.title')} desc={t('overviewPage.desc')} />
			{renderBody()}
		</div>
	);
}

function EmptyGateway(): ReactElement {
	const { t } = useTranslation();
	const { navigate } = useGateway();

	function handleCreateRoute(): void {
		navigate('routes');
	}

	return (
		<div className="card overview-empty" data-card="overview-empty">
			<RouteIcon size={22} aria-hidden="true" />
			<div>
				<h2>{t('overviewPage.empty.title')}</h2>
				<p className="muted">{t('overviewPage.empty.desc')}</p>
				<p className="muted">
					{t('overviewPage.empty.seedHint')} <code>npm run seed</code>
				</p>
			</div>
			<Button variant="primary" onClick={handleCreateRoute} data-tooltip={t('overviewPage.empty.createTooltip')}>
				{t('overviewPage.empty.create')}
			</Button>
		</div>
	);
}

function OverviewBody({ overview }: OverviewBodyProps): ReactElement {
	const { t } = useTranslation();
	const liveStatus = useLiveDataStatus();
	const nowMs = useNow(RELATIVE_TIME_TICK_MS);
	const hasRoutes = overview.traffic.routes.length > 0 || overview.services.some((service) => service.routeCount > 0);
	const note = <LiveChartNote status={liveStatus} windowLabel={t('overviewPage.cards.lastHour')} />;

	return (
		<>
			<section className="dashboard-hero" data-section="overview-hero">
				<div className="dashboard-span-4">
					<OverviewAttentionBanner items={buildAttentionItems(overview)} />
				</div>
				<div className="dashboard-span-2">
					<GatewayStatusPanel status={overview.gateway} nowMs={nowMs} />
				</div>
			</section>
			{!hasRoutes && <EmptyGateway />}
			<section className="overview-tiles" data-section="overview-tiles">
				<TrafficTotalsTiles traffic={overview.traffic} />
			</section>
			<section className="dashboard-grid" data-section="overview-grid">
				<DashboardCard
					name="overview-traffic-chart"
					span={4}
					title={t('overviewPage.cards.traffic')}
					note={note}
					content="chart"
					isScrollable={false}
				>
					<TrafficChart traffic={overview.traffic} isLive={liveStatus.state === 'live'} />
				</DashboardCard>
				<DashboardCard
					name="overview-health"
					span={2}
					title={t('overviewPage.cards.instances')}
					note={t('overviewPage.cards.instancesNote')}
					content="chart"
				>
					<ServiceHealthGrid services={overview.services} />
				</DashboardCard>
				<DashboardCard
					name="overview-alerts"
					span={3}
					title={t('overviewPage.cards.alerts')}
					note={t('overviewPage.cards.alertsNote', { count: overview.openAlerts.length })}
					content="table"
					isScrollable
				>
					<GatewayAlertsList alerts={overview.openAlerts} services={overview.services} nowMs={nowMs} />
				</DashboardCard>
				<DashboardCard
					name="overview-changes"
					span={3}
					title={t('overviewPage.cards.changes')}
					note={t('overviewPage.cards.changesNote')}
					content="table"
					isScrollable
				>
					<RecentChangesPanel changes={overview.recentChanges} nowMs={nowMs} />
				</DashboardCard>
				<div className="dashboard-span-6" data-card="overview-system-health">
					<SystemHealthPanel />
				</div>
			</section>
		</>
	);
}
