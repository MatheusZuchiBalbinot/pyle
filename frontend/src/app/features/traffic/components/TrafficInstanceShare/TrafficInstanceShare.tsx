import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { InstanceTraffic } from '@/app/api/adminApiTypes';
import { formatLatency, formatRate } from '@/app/lib/formatTraffic';
import { toSharePercents } from '@/app/lib/sharePercents';

import './TrafficInstanceShare.css';

export type TrafficInstanceShareProps = {
	readonly instances: readonly InstanceTraffic[];
	readonly onOpenInstance: (instanceId: string) => void;
};

type ShareRowProps = { readonly instance: InstanceTraffic; readonly percent: number; readonly onOpen: (instanceId: string) => void };

export function TrafficInstanceShare({ instances, onOpenInstance }: TrafficInstanceShareProps): ReactElement {
	const { t } = useTranslation();

	if (instances.length === 0) {
		return <div className="panel-empty">{t('traffic.share.empty')}</div>;
	}

	const percents = toSharePercents(instances.map((instance) => instance.share));

	return (
		<ul className="share-list">
			{instances.map((instance, index) => (
				<ShareRow key={instance.instanceId} instance={instance} percent={percents[index]} onOpen={onOpenInstance} />
			))}
		</ul>
	);
}

function ShareRow({ instance, percent, onOpen }: ShareRowProps): ReactElement {
	const { t } = useTranslation();

	function handleClick(): void {
		onOpen(instance.instanceId);
	}

	return (
		<li>
			<button type="button" className="share-row" onClick={handleClick} data-tooltip={t('traffic.share.openTooltip', { instance: instance.name })}>
				<span className="share-name mono">{instance.name}</span>
				<span className="share-bar" aria-hidden="true">
					<span className="share-fill" style={{ width: `${percent}%` }} />
				</span>
				<span className="share-percent">{percent}%</span>
				<span className="share-meta">
					{t('traffic.share.p95', { value: formatLatency(instance.totals.p95Ms) })} ·{' '}
					{t('traffic.share.errors', { value: formatRate(instance.totals.errorRate) })}
				</span>
			</button>
		</li>
	);
}
