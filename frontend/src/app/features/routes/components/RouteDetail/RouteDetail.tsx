import { Activity, Pencil, Trash2 } from 'lucide-react';
import { useCallback, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { getRouteTraffic } from '@/app/api/adminApiClient';
import type { Route } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { AnalyzeButton } from '@/app/features/ai/components/AnalyzeButton/AnalyzeButton';
import { describeRewrite } from '@/app/features/routes/lib/routeFormValidation';
import { TrafficChart } from '@/app/features/traffic/components/TrafficChart/TrafficChart';
import { TrafficTotalsTiles } from '@/app/features/traffic/components/TrafficTotalsTiles/TrafficTotalsTiles';
import { useLiveDataStatus, useLiveTraffic } from '@/app/features/traffic/hooks/useLiveTraffic';
import { useScrollIntoViewWhen } from '@/app/hooks/useScrollIntoViewWhen';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';

import './RouteDetail.css';

import { queryKeys } from '@/app/core/query/queryKeys';

const DETAIL_WINDOW = '1h';

export type RouteDetailProps = {
	readonly route: Route;
	readonly onEdit: (route: Route) => void;
	readonly onDelete: (route: Route) => void;
};

type ConfigRow = { readonly label: string; readonly value: string };

export function RouteDetail({ route, onEdit, onDelete }: RouteDetailProps): ReactElement {
	const { t } = useTranslation();
	const { openSelection } = useGateway();
	const liveStatus = useLiveDataStatus();
	const containerRef = useRef<HTMLDivElement>(null);

	useScrollIntoViewWhen(containerRef, route.id);
	const load = useCallback(() => getRouteTraffic(route.id, { window: DETAIL_WINDOW }), [route.id]);
	const traffic = useLiveTraffic(load, {
		queryKey: queryKeys.routeTraffic(route.id, DETAIL_WINDOW),
		fallbackErrorMessage: t('routes.detail.trafficError'),
	}).loadState;
	const trafficView = traffic.status === LOAD_STATUS.loaded ? { series: traffic.data.series, window: traffic.data.window } : null;
	const rewrite = describeRewrite(route.pathPrefix, route.stripPrefix);
	const rows: readonly ConfigRow[] = [
		{ label: t('routes.detail.rewrite'), value: `${rewrite.incoming} → ${rewrite.forwarded}` },
		{ label: t('routes.detail.service'), value: `${route.service.name} (${route.service.slug})` },
		{ label: t('routes.detail.methods'), value: route.methods.length === 0 ? t('routes.list.allMethods') : route.methods.join(', ') },
		{ label: t('routes.detail.auth'), value: route.isAuthRequired ? t('routes.list.authRequired') : t('routes.list.public') },
		{
			label: t('routes.detail.rateLimit'),
			value: route.rateLimitPerMinute === null ? t('routes.detail.noLimit') : t('routes.detail.perMinute', { count: route.rateLimitPerMinute }),
		},
		{ label: t('routes.detail.timeout'), value: route.timeoutMs === null ? t('routes.detail.serviceTimeout') : `${route.timeoutMs} ms` },
	];

	function handleSeeTraffic(): void {
		openSelection({ type: 'route-traffic', routeId: route.id });
	}

	function handleEdit(): void {
		onEdit(route);
	}

	function handleDelete(): void {
		onDelete(route);
	}

	return (
		<div className="card route-detail" ref={containerRef} data-card="route-detail">
			<div className="route-detail-head">
				<div>
					<h2 className="route-detail-title">{route.name}</h2>
					<span className="mono route-detail-prefix">{route.pathPrefix}</span>
				</div>
				<div className="route-detail-actions">
					<AnalyzeButton scope="route" subjectId={route.id} isCompact />
					<Button isSmall onClick={handleSeeTraffic} data-tooltip={t('routes.detail.seeTrafficTooltip')}>
						<Activity size={13} aria-hidden="true" />
						{t('routes.detail.seeTraffic')}
					</Button>
					<Button isSmall onClick={handleEdit} data-tooltip={t('routes.detail.editTooltip')}>
						<Pencil size={13} aria-hidden="true" />
						{t('common.edit')}
					</Button>
					<Button isSmall variant="danger" onClick={handleDelete} data-tooltip={t('routes.detail.deleteTooltip')}>
						<Trash2 size={13} aria-hidden="true" />
						{t('common.remove')}
					</Button>
				</div>
			</div>
			<dl className="route-detail-config">
				{rows.map((row) => (
					<div key={row.label}>
						<dt>{row.label}</dt>
						<dd className="mono">{row.value}</dd>
					</div>
				))}
			</dl>
			<TrafficTotalsTiles traffic={trafficView} />
			<TrafficChart traffic={trafficView} isLive={liveStatus.state === 'live'} />
		</div>
	);
}
