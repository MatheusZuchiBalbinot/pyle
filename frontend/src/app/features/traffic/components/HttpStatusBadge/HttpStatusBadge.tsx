import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayErrorCode, StatusClass } from '@/app/api/adminApiTypes';
import { GATEWAY_ERROR_LABEL_KEY, statusClassOf } from '@/app/lib/gatewayLabels';

import '@/app/ui/StatusBadge/StatusBadge.css';
import './HttpStatusBadge.css';

const TONE_BY_CLASS: Readonly<Record<StatusClass, string>> = {
	'2xx': 'badge-success',
	'3xx': 'badge-info',
	'4xx': 'badge-warning',
	'5xx': 'badge-danger',
};

export type HttpStatusBadgeProps = {
	readonly status: number;
	// Set when the gateway answered itself; explained in the tooltip.
	readonly gatewayError: GatewayErrorCode | null;
};

export function HttpStatusBadge({ status, gatewayError }: HttpStatusBadgeProps): ReactElement {
	const { t } = useTranslation();
	const statusClass = statusClassOf(status);
	const tone = statusClass === null ? 'badge-muted' : TONE_BY_CLASS[statusClass];
	const tooltip = gatewayError === null ? undefined : t(GATEWAY_ERROR_LABEL_KEY[gatewayError]);

	return (
		<span className={`badge ${tone} http-status-badge`} data-tooltip={tooltip}>
			{status}
			{gatewayError !== null && <span className="http-status-gateway">{t('gateway.madeByGatewayShort')}</span>}
		</span>
	);
}
