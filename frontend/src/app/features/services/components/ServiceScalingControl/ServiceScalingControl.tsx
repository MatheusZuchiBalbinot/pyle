import type { TFunction } from 'i18next';
import { Minus, Plus } from 'lucide-react';
import { useId, useRef, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Service } from '@/app/api/adminApiTypes';
import { useServiceScaling } from '@/app/features/services/hooks/useServiceScaling';
import { buildReplicaOverview, type ReplicaOverview } from '@/app/features/services/lib/replicaSlots';
import { IconButton } from '@/app/ui/IconButton/IconButton';

import { ReplicaPills } from '../ReplicaPills/ReplicaPills';
import { ScalingConfirmBar } from '../ScalingConfirmBar/ScalingConfirmBar';

import './ServiceScalingControl.css';

export type ServiceScalingControlProps = {
	readonly service: Service;
	// Null where managed replicas are off.
	readonly maxManagedReplicas: number | null;
	readonly expandedInstanceId: string | null;
	readonly onToggleInstance: (instanceId: string) => void;
};

type ScalingPanelProps = Omit<ServiceScalingControlProps, 'maxManagedReplicas'> & { readonly maxManagedReplicas: number };

export function ServiceScalingControl(props: ServiceScalingControlProps): ReactElement {
	const { service, maxManagedReplicas } = props;
	const { t } = useTranslation();

	if (service.scaling.profile === null) {
		return <p className="faint service-scaling-note">{t('services.scaling.manual')}</p>;
	}

	if (maxManagedReplicas === null) {
		return <p className="faint service-scaling-note">{t('services.scaling.disabled')}</p>;
	}

	return <ScalingPanel {...props} maxManagedReplicas={maxManagedReplicas} />;
}

function ScalingPanel({ service, maxManagedReplicas, expandedInstanceId, onToggleInstance }: ScalingPanelProps): ReactElement {
	const { t } = useTranslation();
	const titleId = useId();
	const stepperLabelId = useId();
	const valueRef = useRef<HTMLSpanElement>(null);
	const scaling = useServiceScaling(service, maxManagedReplicas);
	const overview = buildReplicaOverview(service, maxManagedReplicas);

	// The bar (and the button just pressed) goes away: focus lands on the number it changed.
	function handleCancel(): void {
		scaling.cancel();
		valueRef.current?.focus();
	}

	function handleApply(): void {
		scaling.apply();
		valueRef.current?.focus();
	}

	return (
		<section className="service-scaling" aria-labelledby={titleId}>
			<header className="service-scaling-head">
				<div className="service-scaling-heading">
					<h3 id={titleId}>{t('services.scaling.title')}</h3>
					<p className="faint">{t('services.scaling.help', { count: overview.fixedCount })}</p>
				</div>
				<span className="service-scaling-ready mono" role="status" data-tooltip={t('services.scaling.readyTooltip')}>
					{readyText(overview, t)}
				</span>
			</header>
			<div className="service-scaling-body">
				<ReplicaPills
					overview={overview}
					maxManagedReplicas={maxManagedReplicas}
					selectedInstanceId={expandedInstanceId}
					onSelect={onToggleInstance}
				/>
				<div className="service-scaling-stepper" role="group" aria-labelledby={stepperLabelId}>
					<span id={stepperLabelId} className="muted">
						{t('services.scaling.stepperLabel')}
					</span>
					<IconButton label={t('services.scaling.decrease')} onClick={scaling.decrease} disabled={!scaling.canDecrease}>
						<Minus size={14} />
					</IconButton>
					<span ref={valueRef} className="service-scaling-value mono" tabIndex={-1}>
						{scaling.target}
					</span>
					<IconButton label={t('services.scaling.increase', { max: maxManagedReplicas })} onClick={scaling.increase} disabled={!scaling.canIncrease}>
						<Plus size={14} />
					</IconButton>
				</div>
			</div>
			<div aria-live="polite">
				{scaling.isDirty && (
					<ScalingConfirmBar from={scaling.applied} to={scaling.target} isSaving={scaling.isSaving} onCancel={handleCancel} onApply={handleApply} />
				)}
			</div>
		</section>
	);
}

// Zero asked for is the normal state, not "0/0 ready".
function readyText(overview: ReplicaOverview, t: TFunction): string {
	if (overview.desiredCount === 0) {
		return t('services.scaling.none');
	}

	return t('services.scaling.ready', { ready: overview.readyCount, desired: overview.desiredCount });
}
