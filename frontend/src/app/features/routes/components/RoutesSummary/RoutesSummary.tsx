import { Activity, Ban, Route as RouteIcon, Timer } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteRow } from '@/app/features/routes/hooks/useRoutesPage';
import { summarizeRoutes } from '@/app/features/routes/lib/routesSummary';
import { formatCompactCount, formatLatency, formatRps } from '@/app/lib/formatTraffic';
import { StatusIntro } from '@/app/ui/StatusIntro/StatusIntro';

export type RoutesSummaryProps = { readonly rows: readonly RouteRow[] };

export function RoutesSummary({ rows }: RoutesSummaryProps): ReactElement {
	const { t } = useTranslation();
	const summary = summarizeRoutes(rows);
	const slowest = summary.slowest;

	return (
		<section className="dashboard-hero routes-summary" data-section="routes-summary">
			<div className="dashboard-span-3">
				<StatusIntro
					name="routes-summary-banner"
					tone="info"
					icon={<RouteIcon size={20} />}
					eyebrow={t('routes.summary.eyebrow')}
					title={t('routes.summary.title', { count: summary.routeCount })}
					description={t('routes.summary.desc', { protected: summary.protectedCount, limited: summary.limitedCount })}
				/>
			</div>
			<StatusIntro
				name="routes-summary-traffic"
				layout="tile"
				tone="info"
				icon={<Activity size={16} />}
				eyebrow={t('routes.summary.traffic')}
				figure={formatRps(summary.requestsPerSecond)}
				title={t('routes.summary.trafficTitle')}
				description={t('routes.summary.window')}
			/>
			<StatusIntro
				name="routes-summary-slowest"
				layout="tile"
				tone="info"
				icon={<Timer size={16} />}
				eyebrow={t('routes.summary.slowest')}
				figure={slowest === null ? '-' : formatLatency(slowest.p95Ms)}
				title={slowest === null ? t('routes.summary.noTraffic') : slowest.name}
				description={t('routes.summary.slowestDesc')}
			/>
			<StatusIntro
				name="routes-summary-limited"
				layout="tile"
				tone={summary.rateLimitedCount > 0 ? 'warning' : 'healthy'}
				icon={<Ban size={16} />}
				eyebrow={t('routes.summary.limited')}
				figure={formatCompactCount(summary.rateLimitedCount)}
				title={t('routes.summary.limitedTitle')}
				description={t('routes.summary.limitedDesc')}
			/>
		</section>
	);
}
