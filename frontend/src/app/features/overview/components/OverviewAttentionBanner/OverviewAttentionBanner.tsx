import { CircleCheck, TriangleAlert } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useGateway } from '@/app/core/gateway/useGateway';
import type { AttentionItem } from '@/app/features/overview/lib/overviewAttention';
import { StatusIntro } from '@/app/ui/StatusIntro/StatusIntro';

import './OverviewAttentionBanner.css';

export type OverviewAttentionBannerProps = { readonly items: readonly AttentionItem[] };

type AttentionRowProps = { readonly item: AttentionItem };

export function OverviewAttentionBanner({ items }: OverviewAttentionBannerProps): ReactElement {
	const { t } = useTranslation();

	if (items.length === 0) {
		return (
			<StatusIntro
				name="overview-attention"
				tone="healthy"
				icon={<CircleCheck size={20} />}
				eyebrow={t('overviewPage.attention.eyebrow')}
				title={t('overviewPage.attention.allGood')}
				description={t('overviewPage.attention.allGoodDesc')}
			/>
		);
	}

	const hasDanger = items.some((item) => item.tone === 'danger');
	const list = (
		<ul className="attention-list">
			{items.map((item) => (
				<AttentionRow key={item.id} item={item} />
			))}
		</ul>
	);

	return (
		<StatusIntro
			name="overview-attention"
			tone={hasDanger ? 'danger' : 'warning'}
			icon={<TriangleAlert size={20} />}
			eyebrow={t('overviewPage.attention.eyebrow')}
			title={t('overviewPage.attention.needsAttention', { count: items.length })}
			description={t('overviewPage.attention.needsAttentionDesc')}
			footer={list}
		/>
	);
}

function AttentionRow({ item }: AttentionRowProps): ReactElement {
	const { t } = useTranslation();
	const { openSelection } = useGateway();
	const text = t(item.messageKey, item.values);
	const selection = item.selection;

	if (selection === null) {
		return <li className={`attention-row is-${item.tone}`}>{text}</li>;
	}

	function handleClick(): void {
		if (selection) {
			openSelection(selection);
		}
	}

	return (
		<li className={`attention-row is-${item.tone}`}>
			<button type="button" className="attention-link" onClick={handleClick} data-tooltip={t('overviewPage.attention.openTooltip')}>
				{text}
			</button>
		</li>
	);
}
