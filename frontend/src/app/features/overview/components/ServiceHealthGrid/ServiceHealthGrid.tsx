import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { InstanceStateBadge } from '@/app/features/services/components/InstanceStateBadge/InstanceStateBadge';
import { INSTANCE_BADGE_TONE, resolveInstanceBadge } from '@/app/lib/gatewayLabels';

import './ServiceHealthGrid.css';

export type ServiceHealthGridProps = { readonly services: readonly Service[] };

type InstanceCellProps = { readonly service: Service; readonly instance: ServiceInstance };

type HealthGroupProps = { readonly service: Service };

export function ServiceHealthGrid({ services }: ServiceHealthGridProps): ReactElement {
	const { t } = useTranslation();

	if (services.length === 0) {
		return <div className="panel-empty">{t('overviewPage.health.empty')}</div>;
	}

	return (
		<div className="health-grid">
			{services.map((service) => (
				<HealthGroup key={service.id} service={service} />
			))}
		</div>
	);
}

// The bar repeats the cells in one glance; the count says it in words.
function HealthGroup({ service }: HealthGroupProps): ReactElement {
	const { t } = useTranslation();
	const states = service.instances.map((instance) => resolveInstanceBadge(instance));
	const healthyCount = states.filter((state) => state === 'healthy').length;

	return (
		<section className="health-group" aria-label={service.name}>
			<header className="health-group-head">
				<h3 className="health-group-title">{service.name}</h3>
				<span className="health-group-count">{t('overviewPage.health.healthyCount', { healthy: healthyCount, total: states.length })}</span>
			</header>
			<div className="health-bar" aria-hidden="true">
				{states.map((state, index) => (
					<span key={service.instances[index].id} className={`health-bar-segment is-${INSTANCE_BADGE_TONE[state]}`} />
				))}
			</div>
			<div className="health-cells">
				{service.instances.map((instance) => (
					<InstanceCell key={instance.id} service={service} instance={instance} />
				))}
			</div>
		</section>
	);
}

function InstanceCell({ service, instance }: InstanceCellProps): ReactElement {
	const { t } = useTranslation();
	const { openSelection } = useGateway();

	function handleClick(): void {
		openSelection({ type: 'service', serviceSlug: service.slug, instanceId: instance.id });
	}

	return (
		<button
			type="button"
			className="health-cell"
			onClick={handleClick}
			data-tooltip={t('overviewPage.health.openInstance', { instance: instance.name })}
		>
			<InstanceStateBadge instance={instance} isCompact />
			<span className="health-cell-name">{instance.name}</span>
		</button>
	);
}
