import { Ban, KeyRound, Users, Zap } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConsumerRow } from '@/app/features/consumers/hooks/useConsumersPage';
import { summarizeConsumers } from '@/app/features/consumers/lib/consumersSummary';
import { formatCompactCount } from '@/app/lib/formatTraffic';
import { StatusIntro } from '@/app/ui/StatusIntro/StatusIntro';

export type ConsumersSummaryProps = { readonly rows: readonly ConsumerRow[] };

export function ConsumersSummary({ rows }: ConsumersSummaryProps): ReactElement {
	const { t } = useTranslation();
	const summary = summarizeConsumers(rows);
	const { busiest, mostLimited } = summary;

	return (
		<section className="dashboard-hero consumers-summary" data-section="consumers-summary">
			<div className="dashboard-span-3">
				<StatusIntro
					name="consumers-summary-banner"
					tone="info"
					icon={<Users size={20} />}
					eyebrow={t('consumers.summary.eyebrow')}
					title={t('consumers.summary.title', { count: summary.consumerCount })}
					description={t('consumers.summary.desc', { count: summary.activeKeyCount })}
				/>
			</div>
			<StatusIntro
				name="consumers-summary-requests"
				layout="tile"
				tone="info"
				icon={<Zap size={16} />}
				eyebrow={t('consumers.summary.requests')}
				figure={formatCompactCount(summary.requestCount)}
				title={t('consumers.summary.requestsTitle')}
				description={t('consumers.summary.window')}
			/>
			<StatusIntro
				name="consumers-summary-busiest"
				layout="tile"
				tone="info"
				icon={<KeyRound size={16} />}
				eyebrow={t('consumers.summary.busiest')}
				figure={busiest === null ? '-' : formatCompactCount(busiest.count)}
				title={busiest === null ? t('consumers.summary.nobody') : busiest.name}
				description={t('consumers.summary.busiestDesc')}
			/>
			<StatusIntro
				name="consumers-summary-limited"
				layout="tile"
				tone={mostLimited === null ? 'healthy' : 'warning'}
				icon={<Ban size={16} />}
				eyebrow={t('consumers.summary.limited')}
				figure={formatCompactCount(summary.rateLimitedCount)}
				title={mostLimited === null ? t('consumers.summary.nobodyLimited') : t('consumers.summary.mostLimited', { name: mostLimited.name })}
				description={t('consumers.summary.limitedDesc')}
			/>
		</section>
	);
}
