import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Consumer, Route } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { DashboardCard } from '@/app/ui/DashboardCard/DashboardCard';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { SelectInput, type SelectOption } from '@/app/ui/SelectInput/SelectInput';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import { LiveChartNote } from './components/LiveChartNote/LiveChartNote';
import { RequestLogTable, type RequestLogChoice } from './components/RequestLogTable/RequestLogTable';
import { TrafficChart } from './components/TrafficChart/TrafficChart';
import { TrafficInstanceShare } from './components/TrafficInstanceShare/TrafficInstanceShare';
import { TrafficRoutesTable } from './components/TrafficRoutesTable/TrafficRoutesTable';
import { TrafficStatusBreakdown } from './components/TrafficStatusBreakdown/TrafficStatusBreakdown';
import { TrafficTopConsumers } from './components/TrafficTopConsumers/TrafficTopConsumers';
import { TrafficTotalsTiles } from './components/TrafficTotalsTiles/TrafficTotalsTiles';
import { TrafficWindowPicker } from './components/TrafficWindowPicker/TrafficWindowPicker';
import { useLiveDataStatus } from './hooks/useLiveTraffic';
import { useTrafficPage, type TrafficView } from './hooks/useTrafficPage';

import './TrafficPage.css';

const ALL_ROUTES = '';
const CARD_SKELETON_HEIGHT = '220px';

type ViewCardsProps = {
	readonly view: TrafficView | null;
	readonly consumers: readonly RequestLogChoice[];
	readonly onSelectRoute: (routeId: string) => void;
};

export function TrafficPage(): ReactElement {
	const { t } = useTranslation();
	const { window, setWindow, routeId, selectRoute, view, errorMessage } = useTrafficPage();
	const liveStatus = useLiveDataStatus();
	const routes = useConfigList('routes').loadState;
	const consumers = useConfigList('consumers').loadState;
	const routeList = routes.status === LOAD_STATUS.loaded ? routes.data : [];
	const consumerList = consumers.status === LOAD_STATUS.loaded ? consumerChoices(consumers.data) : [];

	function handleRouteChange(value: string): void {
		selectRoute(value === ALL_ROUTES ? null : value);
	}

	const traffic = view === null ? null : { series: view.data.series, window: view.data.window };
	const windowLabel = t(`gateway.window.${window}`);

	return (
		<div className="page" data-page="traffic">
			<PageHeader title={t('traffic.title')} desc={t('traffic.desc')}>
				<div className="traffic-toolbar">
					<SelectInput
						label={t('traffic.routeFilter')}
						options={routeOptions(t('traffic.allRoutes'), routeList)}
						value={routeId ?? ALL_ROUTES}
						onChange={handleRouteChange}
					/>
					<TrafficWindowPicker value={window} onChange={setWindow} />
				</div>
			</PageHeader>
			{errorMessage !== null && (
				<div className="traffic-error" role="alert">
					{t('traffic.refreshFailed', { message: errorMessage })}
				</div>
			)}
			<TrafficTotalsTiles traffic={traffic} />
			<section className="dashboard-grid" data-section="traffic-grid">
				<DashboardCard
					name="traffic-chart"
					span={6}
					title={t('traffic.cards.chart')}
					note={<LiveChartNote status={liveStatus} windowLabel={windowLabel} />}
					content="chart"
					isScrollable={false}
				>
					<TrafficChart traffic={traffic} isLive={liveStatus.state === 'live'} />
				</DashboardCard>
				<ViewCards view={view} consumers={consumerList} onSelectRoute={selectRoute} />
			</section>
		</div>
	);
}

function routeOptions(allLabel: string, routes: readonly Route[]): readonly SelectOption[] {
	return [{ value: ALL_ROUTES, label: allLabel }, ...routes.map((route) => ({ value: route.id, label: `${route.name} (${route.pathPrefix})` }))];
}

function consumerChoices(consumers: readonly Consumer[]): readonly RequestLogChoice[] {
	return consumers.map((consumer) => ({ id: consumer.id, label: consumer.name }));
}

function ViewCards({ view, consumers, onSelectRoute }: ViewCardsProps): ReactElement {
	const { t } = useTranslation();
	const { openSelection } = useGateway();

	if (view === null) {
		return (
			<>
				<div className="card dashboard-span-3 traffic-card-skeleton">
					<Skeleton height={CARD_SKELETON_HEIGHT} />
				</div>
				<div className="card dashboard-span-3 traffic-card-skeleton">
					<Skeleton height={CARD_SKELETON_HEIGHT} />
				</div>
			</>
		);
	}

	if (view.kind === 'all') {
		return (
			<>
				<DashboardCard name="traffic-routes" span={6} title={t('traffic.cards.routes')} note={t('traffic.cards.routesNote')} content="table">
					<TrafficRoutesTable routes={view.data.routes} onSelect={onSelectRoute} />
				</DashboardCard>
				<DashboardCard name="traffic-consumers" span={6} title={t('traffic.cards.consumers')} note={t('traffic.cards.consumersNote')} content="table">
					<TrafficTopConsumers consumers={view.data.topConsumers} />
				</DashboardCard>
				<DashboardCard name="traffic-log" span={6} title={t('traffic.cards.log')} note={t('traffic.cards.logNote')} content="table">
					<RequestLogTable routeId={undefined} consumers={consumers} instances={[]} />
				</DashboardCard>
			</>
		);
	}

	const serviceSlug = view.data.route.service.slug;

	function handleOpenInstance(instanceId: string): void {
		openSelection({ type: 'service', serviceSlug, instanceId });
	}

	const instances = view.data.instances.map((instance) => ({ id: instance.instanceId, label: instance.name }));

	return (
		<>
			<DashboardCard
				name="traffic-share"
				span={3}
				title={t('traffic.cards.share')}
				note={t('traffic.cards.shareNote')}
				content="chart"
				isScrollable={false}
			>
				<TrafficInstanceShare instances={view.data.instances} onOpenInstance={handleOpenInstance} />
			</DashboardCard>
			<DashboardCard name="traffic-status" span={3} title={t('traffic.cards.status')} content="chart" isScrollable={false}>
				<TrafficStatusBreakdown breakdown={view.data.statusBreakdown} />
			</DashboardCard>
			<DashboardCard name="traffic-log" span={6} title={t('traffic.cards.log')} note={t('traffic.cards.logNote')} content="table">
				<RequestLogTable routeId={view.routeId} consumers={consumers} instances={instances} />
			</DashboardCard>
		</>
	);
}
