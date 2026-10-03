import { Radio, TriangleAlert } from 'lucide-react';
import { useId, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { GatewayStatus } from '@/app/api/adminApiTypes';
import { isGatewayBehind } from '@/app/features/overview/lib/gatewayLag';
import { formatRelativeTime } from '@/app/lib/relativeTime';

import './GatewayStatusPanel.css';

export type GatewayStatusPanelProps = {
	readonly status: GatewayStatus;
	readonly nowMs: number;
};

type Gateway = GatewayStatus['gateways'][number];

type GatewayRowProps = { readonly gateway: Gateway; readonly currentVersion: number; readonly nowMs: number };

// Beside the status banner: which data-plane processes are up and on which config.
export function GatewayStatusPanel({ status, nowMs }: GatewayStatusPanelProps): ReactElement {
	const { t } = useTranslation();
	const titleId = useId();
	const aliveCount = status.gateways.filter((gateway) => gateway.isAlive).length;

	return (
		<section className="gateway-panel" data-card="overview-gateway" aria-labelledby={titleId}>
			<header className="gateway-panel-head">
				<h2 id={titleId}>
					<Radio size={14} aria-hidden="true" />
					{t('overviewPage.gateway.label', { count: status.gateways.length })}
				</h2>
				<span className="gateway-panel-meta">{t('overviewPage.gateway.aliveCount', { alive: aliveCount, total: status.gateways.length })}</span>
			</header>
			{status.gateways.length === 0 && <p className="gateway-panel-empty">{t('overviewPage.gateway.none')}</p>}
			<ul className="gateway-panel-list">
				{status.gateways.map((gateway) => (
					<GatewayRow key={gateway.gatewayId} gateway={gateway} currentVersion={status.configVersion} nowMs={nowMs} />
				))}
			</ul>
		</section>
	);
}

function GatewayRow({ gateway, currentVersion, nowMs }: GatewayRowProps): ReactElement {
	const { t, i18n } = useTranslation();
	const isBehind = isGatewayBehind(gateway, currentVersion);
	const tone = gateway.isAlive ? 'is-up' : 'is-down';
	const since = gateway.isAlive
		? t('overviewPage.gateway.upSince', { ago: formatRelativeTime(gateway.startedAt, nowMs, i18n.language) })
		: t('overviewPage.gateway.silent');

	return (
		<li className={`gateway-row ${tone}`}>
			<span className="gateway-row-dot" aria-hidden="true" />
			<span className="gateway-row-text">
				<span className="gateway-row-name mono">{gateway.gatewayId}</span>
				<span className="gateway-row-meta">{since}</span>
			</span>
			{isBehind && <span className="badge badge-warning">{t('overviewPage.gateway.reloading')}</span>}
			{gateway.isRateLimitDegraded && (
				<span className="badge badge-warning" data-tooltip={t('overviewPage.gateway.rateLimitDegradedTooltip')}>
					<TriangleAlert size={11} aria-hidden="true" />
					{t('overviewPage.gateway.rateLimitDegraded')}
				</span>
			)}
		</li>
	);
}
