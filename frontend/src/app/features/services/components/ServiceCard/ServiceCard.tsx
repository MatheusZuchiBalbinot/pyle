import { Pencil, Plus, Trash2, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { LoadBalancingStrategy, Service, ServiceTraffic } from '@/app/api/adminApiTypes';
import { AnalyzeButton } from '@/app/features/ai/components/AnalyzeButton/AnalyzeButton';
import type { ServiceActions } from '@/app/features/services/hooks/useServiceActions';
import type { TimelineEntry } from '@/app/features/services/hooks/useServiceLiveState';
import { TrafficTotalsTiles } from '@/app/features/traffic/components/TrafficTotalsTiles/TrafficTotalsTiles';
import { resolveInstanceBadge, STRATEGY_LABEL_KEY } from '@/app/lib/gatewayLabels';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';
import { SelectInput } from '@/app/ui/SelectInput/SelectInput';

import { InstanceChaosPanel } from '../InstanceChaosPanel/InstanceChaosPanel';
import { InstanceStateTimeline } from '../InstanceStateTimeline/InstanceStateTimeline';
import { InstanceTable } from '../InstanceTable/InstanceTable';
import { ServiceScalingControl } from '../ServiceScalingControl/ServiceScalingControl';

import './ServiceCard.css';

const STRATEGIES: readonly LoadBalancingStrategy[] = ['round_robin', 'least_connections', 'weighted_random'];

export type ServiceCardProps = {
	readonly service: Service;
	readonly traffic: ServiceTraffic | null;
	readonly expandedInstanceId: string | null;
	readonly onToggleInstance: (instanceId: string) => void;
	readonly isChaosAllowed: boolean;
	// Null where managed replicas are off.
	readonly maxManagedReplicas: number | null;
	readonly timelineOf: (instanceId: string) => readonly TimelineEntry[];
	readonly actions: ServiceActions;
	readonly onEdit: (service: Service) => void;
	readonly onAddInstance: (service: Service) => void;
};

export function ServiceCard(props: ServiceCardProps): ReactElement {
	const { service, traffic, expandedInstanceId, onToggleInstance, isChaosAllowed, timelineOf, actions } = props;
	const { t } = useTranslation();
	const healthyCount = service.instances.filter((instance) => resolveInstanceBadge(instance) === 'healthy').length;
	const expanded = service.instances.find((instance) => instance.id === expandedInstanceId);
	const strategyOptions = STRATEGIES.map((strategy) => ({ value: strategy, label: t(STRATEGY_LABEL_KEY[strategy]) }));
	const trafficView = traffic === null ? null : { series: traffic.series, window: traffic.window };

	function handleStrategy(strategy: LoadBalancingStrategy): void {
		void actions.setStrategy(service, strategy);
	}

	return (
		<article className="card service-card" data-card={`service-${service.slug}`}>
			<header className="service-card-head">
				<div>
					<h2>{service.name}</h2>
					<p className="muted">
						<span className="mono">{service.slug}</span> · {t('services.card.healthy', { healthy: healthyCount, total: service.instances.length })} ·{' '}
						{t('services.card.routes', { count: service.routeCount })}
					</p>
				</div>
				<SelectInput
					label={t('services.card.strategy')}
					options={strategyOptions}
					value={service.lbStrategy}
					onChange={handleStrategy}
					tooltip={t('services.card.strategyTooltip')}
				/>
			</header>
			<TrafficTotalsTiles traffic={trafficView} />
			<ServiceScalingControl
				service={service}
				maxManagedReplicas={props.maxManagedReplicas}
				expandedInstanceId={expandedInstanceId}
				onToggleInstance={onToggleInstance}
			/>
			<div className="service-card-table">
				<InstanceTable
					service={service}
					traffic={traffic?.instances ?? null}
					expandedInstanceId={expandedInstanceId}
					onToggle={onToggleInstance}
					actions={actions}
				/>
			</div>
			{expanded && (
				<div className="service-card-detail" aria-label={t('services.detail.title', { instance: expanded.name })} role="region">
					<header className="instance-detail-head">
						<h3>{t('services.detail.title', { instance: expanded.name })}</h3>
						<span className="mono muted">{expanded.url}</span>
						<IconButton className="instance-detail-close" label={t('services.detail.closeTooltip')} onClick={() => onToggleInstance(expanded.id)}>
							<X size={14} aria-hidden="true" />
						</IconButton>
					</header>
					<InstanceStateTimeline instanceId={expanded.id} entries={timelineOf(expanded.id)} />
					{isChaosAllowed && (
						<InstanceChaosPanel
							key={expanded.id}
							target={{ serviceSlug: service.slug, instanceId: expanded.id, instanceName: expanded.name }}
							current={expanded.chaos}
						/>
					)}
				</div>
			)}
			<footer className="service-card-actions">
				<AnalyzeButton scope="service" subjectId={service.id} isCompact />
				<Button isSmall onClick={() => props.onAddInstance(service)} data-tooltip={t('services.card.addInstanceTooltip')}>
					<Plus size={13} aria-hidden="true" />
					{t('services.card.addInstance')}
				</Button>
				<Button isSmall onClick={() => props.onEdit(service)} data-tooltip={t('services.card.editTooltip')}>
					<Pencil size={13} aria-hidden="true" />
					{t('services.card.edit')}
				</Button>
				<Button isSmall variant="danger" onClick={() => actions.requestRemoveService(service)} data-tooltip={t('services.card.removeTooltip')}>
					<Trash2 size={13} aria-hidden="true" />
					{t('services.card.remove')}
				</Button>
			</footer>
		</article>
	);
}
