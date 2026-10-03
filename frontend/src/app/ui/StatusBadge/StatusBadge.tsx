import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import './StatusBadge.css';

export type StatusValue =
	'up' | 'healthy' | 'ready' | 'degraded' | 'pending' | 'provisioning' | 'deprovisioning' | 'down' | 'failed' | 'disabled' | 'paused' | 'running';

const STATUS_CLASS: Readonly<Record<StatusValue, string>> = {
	up: 'badge-success',
	healthy: 'badge-success',
	ready: 'badge-success',
	running: 'badge-success',
	degraded: 'badge-warning',
	pending: 'badge-muted',
	provisioning: 'badge-warning',
	deprovisioning: 'badge-warning',
	paused: 'badge-warning',
	disabled: 'badge-muted',
	down: 'badge-danger',
	failed: 'badge-danger',
};

const STATUS_LABEL_KEY: Readonly<Record<StatusValue, string>> = {
	up: 'statusBadge.up',
	healthy: 'statusBadge.healthy',
	ready: 'statusBadge.ready',
	running: 'statusBadge.running',
	degraded: 'statusBadge.degraded',
	pending: 'statusBadge.pending',
	provisioning: 'statusBadge.provisioning',
	deprovisioning: 'statusBadge.deprovisioning',
	paused: 'statusBadge.paused',
	disabled: 'statusBadge.disabled',
	down: 'statusBadge.down',
	failed: 'statusBadge.failed',
};

export type StatusBadgeProps = {
	readonly status: StatusValue;
	readonly label?: string;
};

export function StatusBadge({ status, label }: StatusBadgeProps): ReactElement {
	const { t } = useTranslation();

	return (
		<span className={`badge ${STATUS_CLASS[status]}`}>
			<span className="dot" />
			{label ?? t(STATUS_LABEL_KEY[status])}
		</span>
	);
}
