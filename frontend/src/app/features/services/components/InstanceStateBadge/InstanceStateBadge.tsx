import { CircleCheck, CircleHelp, CirclePause, CircleX, LoaderCircle, LogOut, RefreshCw, Zap, type LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ServiceInstance } from '@/app/api/adminApiTypes';
import { INSTANCE_BADGE_TONE, resolveInstanceBadge, type InstanceBadgeState } from '@/app/lib/gatewayLabels';

import '@/app/ui/StatusBadge/StatusBadge.css';
import './InstanceStateBadge.css';

const ICON_BY_STATE: Readonly<Record<InstanceBadgeState, LucideIcon>> = {
	starting: LoaderCircle,
	leaving: LogOut,
	circuit_open: Zap,
	unhealthy: CircleX,
	half_open: RefreshCw,
	drained: CirclePause,
	healthy: CircleCheck,
	unknown: CircleHelp,
};

const ICON_SIZE = 12;

export type InstanceStateBadgeProps = {
	readonly instance: Pick<ServiceInstance, 'isEnabled' | 'live' | 'scalingState'>;
	// Icon only (the label stays as the tooltip and for screen readers).
	readonly isCompact?: boolean;
};

// Never color alone: an icon and a word.
export function InstanceStateBadge({ instance, isCompact = false }: InstanceStateBadgeProps): ReactElement {
	const { t } = useTranslation();
	const state = resolveInstanceBadge(instance);
	const Icon = ICON_BY_STATE[state];
	const label = t(`gateway.instanceState.${state}`);
	const compactClassName = isCompact ? 'is-compact' : '';

	return (
		<span
			className={`badge badge-${INSTANCE_BADGE_TONE[state]} instance-state-badge ${compactClassName}`.trim()}
			data-state={state}
			data-tooltip={t(`gateway.instanceStateHint.${state}`)}
		>
			<Icon size={ICON_SIZE} aria-hidden="true" />
			{isCompact ? <span className="sr-only">{label}</span> : label}
		</span>
	);
}
