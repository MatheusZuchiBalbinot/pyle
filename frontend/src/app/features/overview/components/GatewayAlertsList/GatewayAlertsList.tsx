import { ShieldCheck } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayAlert, Service } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { selectionForAlert } from '@/app/features/overview/lib/overviewAttention';
import { ALERT_KIND_LABEL_KEYS } from '@/app/lib/adminLabels';
import { formatRelativeTime } from '@/app/lib/relativeTime';

import './GatewayAlertsList.css';

export type GatewayAlertsListProps = { readonly alerts: readonly GatewayAlert[]; readonly services: readonly Service[]; readonly nowMs: number };

type AlertRowProps = { readonly alert: GatewayAlert; readonly services: readonly Service[]; readonly nowMs: number };

export function GatewayAlertsList({ alerts, services, nowMs }: GatewayAlertsListProps): ReactElement {
	const { t } = useTranslation();

	if (alerts.length === 0) {
		return (
			<div className="alerts-empty">
				<span className="alerts-empty-icon" aria-hidden="true">
					<ShieldCheck size={18} />
				</span>
				<strong>{t('overviewPage.alerts.empty')}</strong>
				<span>{t('overviewPage.alerts.emptyHint')}</span>
			</div>
		);
	}

	return (
		<ul className="alerts-list">
			{alerts.map((alert) => (
				<AlertRow key={alert.id} alert={alert} services={services} nowMs={nowMs} />
			))}
		</ul>
	);
}

function AlertRow({ alert, services, nowMs }: AlertRowProps): ReactElement {
	const { t, i18n } = useTranslation();
	const { openSelection } = useGateway();
	const selection = selectionForAlert(alert, services);

	function handleClick(): void {
		if (selection) {
			openSelection(selection);
		}
	}

	const severityClassName = alert.severity === 'critical' ? 'badge-danger' : 'badge-warning';

	return (
		<li className="alerts-row">
			<span className={`badge ${severityClassName}`}>{t(`overviewPage.alerts.severity.${alert.severity}`)}</span>
			<button
				type="button"
				className="alerts-row-body"
				onClick={handleClick}
				disabled={selection === null}
				data-tooltip={t('overviewPage.alerts.openTooltip')}
			>
				<span className="alerts-row-title">{t(ALERT_KIND_LABEL_KEYS[alert.kind])}</span>
				<span className="alerts-row-message">{alert.subjectName}</span>
			</button>
			<span className="alerts-row-time">{formatRelativeTime(alert.triggeredAt, nowMs, i18n.language)}</span>
		</li>
	);
}
