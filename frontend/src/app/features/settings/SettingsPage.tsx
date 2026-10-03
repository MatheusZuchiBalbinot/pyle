import type { TFunction } from 'i18next';
import { Activity, Radio, SlidersHorizontal, Sparkles } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { PlatformSettings } from '@/app/api/adminApiTypes';
import type { RealtimeConnectionState } from '@/app/core/realtime/realtimeContext';
import { useRealtime } from '@/app/core/realtime/useRealtime';
import { platformSettingsQuery } from '@/app/features/settings/lib/settingsQueries';
import { useAsyncResource } from '@/app/hooks/useAsyncResource';
import { AI_PROVIDER_LABELS } from '@/app/lib/adminLabels';
import { formatDurationMs } from '@/app/lib/format';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { DashboardCard } from '@/app/ui/DashboardCard/DashboardCard';
import { DashboardHeroSkeleton } from '@/app/ui/DashboardSkeleton/DashboardSkeleton';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { StatusIntro, type StatusIntroTone } from '@/app/ui/StatusIntro/StatusIntro';

import { AlertRuleConfigPanel } from './components/AlertRuleConfigPanel/AlertRuleConfigPanel';
import { SystemHealthPanel } from './components/SystemHealthPanel/SystemHealthPanel';
import { useAlertRules } from './hooks/useAlertRules';

import './SettingsPage.css';

type ConfigRow = { readonly label: string; readonly value: string; readonly isMissing?: boolean };

// The console's own live connection — what keeps its charts and lists
// current without polling.
const REALTIME_TONE_BY_STATE: Readonly<Record<RealtimeConnectionState, StatusIntroTone>> = {
	connected: 'healthy',
	connecting: 'info',
	reconnecting: 'warning',
	offline: 'danger',
};

const PERCENT_FACTOR = 100;

export function SettingsPage(): ReactElement {
	const { t } = useTranslation();
	const settingsQuery = platformSettingsQuery();
	const settingsState = useAsyncResource(settingsQuery.queryFn, {
		queryKey: settingsQuery.queryKey,
		fallbackErrorMessage: t('settingsPage.loadError'),
	}).loadState;
	const { loadState: rulesState, refetch: refetchRules } = useAlertRules();
	const { connectionState } = useRealtime();

	const header = <PageHeader title={t('settingsPage.title')} desc={t('settingsPage.desc')} />;

	function renderHero(): ReactElement {
		const isLoading = settingsState.status === LOAD_STATUS.loading || rulesState.status === LOAD_STATUS.loading;

		if (isLoading) {
			return <DashboardHeroSkeleton pageName="settings" />;
		}

		if (settingsState.status === LOAD_STATUS.error) {
			return <div className="error-state">{settingsState.message}</div>;
		}

		if (rulesState.status === LOAD_STATUS.error) {
			return <div className="error-state">{rulesState.message}</div>;
		}

		const settings = settingsState.data;
		const rules = rulesState.data;
		const disabledCount = rules.filter((rule) => !rule.isEnabled).length;
		const interval = formatDurationMs(settings.traffic.alertEvaluationIntervalMs);

		return (
			<section className="dashboard-hero" data-section="settings-hero">
				<div className="dashboard-span-3" data-card="settings-hero-banner">
					<StatusIntro
						name="settings-hero-intro"
						tone={disabledCount === 0 ? 'healthy' : 'warning'}
						icon={<SlidersHorizontal size={20} />}
						eyebrow={t('settingsPage.intro.eyebrow')}
						title={
							disabledCount === 0
								? t('settingsPage.intro.allEnabled', { count: rules.length })
								: t('settingsPage.intro.someDisabled', { count: disabledCount })
						}
						description={t('settingsPage.intro.desc', { interval })}
					/>
				</div>
				<StatusIntro
					name="settings-ai-tile"
					layout="tile"
					tone={settings.ai.isConfigured ? 'healthy' : 'warning'}
					icon={<Sparkles size={16} />}
					eyebrow={t('settingsPage.tiles.ai')}
					figure={settings.ai.isConfigured ? AI_PROVIDER_LABELS[settings.ai.provider] : t('settingsPage.tiles.aiNone')}
					title={settings.ai.isConfigured ? t('settingsPage.tiles.aiConfigured') : t('settingsPage.tiles.aiMissing')}
					description={
						settings.ai.isConfigured ? t('settingsPage.tiles.aiDesc', { model: settings.ai.modelId }) : t('settingsPage.tiles.aiMissingDesc')
					}
				/>
				<StatusIntro
					name="settings-traffic-tile"
					layout="tile"
					tone="info"
					icon={<Activity size={16} />}
					eyebrow={t('settingsPage.tiles.traffic')}
					figure={formatDurationMs(settings.gateway.metricsFlushMs)}
					title={t('settingsPage.tiles.trafficTitle', { hours: settings.traffic.retentionHours })}
					description={t('settingsPage.tiles.trafficDesc')}
				/>
				<StatusIntro
					name="settings-realtime-tile"
					layout="tile"
					tone={REALTIME_TONE_BY_STATE[connectionState]}
					icon={<Radio size={16} />}
					eyebrow={t('settingsPage.tiles.realtime')}
					figure={t(`realtime.${connectionState}`)}
					title={t('settingsPage.tiles.realtimeTitle')}
					description={t('settingsPage.tiles.realtimeDesc')}
				/>
			</section>
		);
	}

	function renderPlatformRows(): ReactElement {
		if (settingsState.status !== LOAD_STATUS.loaded) {
			return <div className="settings-config-empty">{t('settingsPage.loadError')}</div>;
		}

		return (
			<dl className="settings-config">
				{buildConfigRows(settingsState.data, t).map((row) => (
					<div key={row.label} className={`settings-config-row ${row.isMissing ? 'is-missing' : ''}`}>
						<dt>{row.label}</dt>
						<dd className="mono">{row.value}</dd>
					</div>
				))}
			</dl>
		);
	}

	return (
		<div className="page" data-page="settings">
			{header}
			{renderHero()}
			<section className="dashboard-grid" data-section="settings-grid">
				<DashboardCard
					name="settings-rules-card"
					span={6}
					title={t('settingsPage.cards.rules')}
					note={t('settingsPage.cards.rulesNote')}
					content="chart"
					isScrollable={false}
				>
					<AlertRuleConfigPanel loadState={rulesState} refetch={refetchRules} />
				</DashboardCard>
				<DashboardCard
					name="settings-platform-card"
					span={6}
					title={t('settingsPage.cards.platform')}
					note={t('settingsPage.cards.platformNote')}
					content="table"
					isScrollable={false}
				>
					{renderPlatformRows()}
				</DashboardCard>
				<div className="dashboard-span-3 settings-health" data-card="settings-health-card">
					<SystemHealthPanel />
				</div>
			</section>
		</div>
	);
}

function buildConfigRows(settings: PlatformSettings, t: TFunction): readonly ConfigRow[] {
	return [
		{
			label: t('settingsPage.platform.gatewayPorts'),
			value: t('settingsPage.platform.ports', { traffic: settings.gateway.port, admin: settings.gateway.adminPort }),
		},
		{ label: t('settingsPage.platform.configRefresh'), value: formatDurationMs(settings.gateway.configRefreshMs) },
		{ label: t('settingsPage.platform.metricsFlush'), value: formatDurationMs(settings.gateway.metricsFlushMs) },
		{ label: t('settingsPage.platform.heartbeat'), value: formatDurationMs(settings.gateway.heartbeatMs) },
		{ label: t('settingsPage.platform.maxRequestTimeout'), value: formatDurationMs(settings.gateway.maxRequestTimeoutMs) },
		{
			label: t('settingsPage.platform.requestLog'),
			value: t('settingsPage.platform.requestLogValue', {
				entries: settings.gateway.requestLogMaxEntries,
				percent: Math.round(settings.gateway.requestLogSuccessSampleRate * PERCENT_FACTOR),
			}),
		},
		{ label: t('settingsPage.platform.trafficRetention'), value: t('settingsPage.platform.hours', { count: settings.traffic.retentionHours }) },
		{ label: t('settingsPage.platform.alertEvaluation'), value: formatDurationMs(settings.traffic.alertEvaluationIntervalMs) },
		{ label: t('settingsPage.platform.consumerPurge'), value: t('settingsPage.platform.days', { count: settings.traffic.consumerPurgeAfterDays }) },
		{
			label: t('settingsPage.platform.chaos'),
			value: settings.traffic.isChaosAllowed ? t('settingsPage.platform.chaosOn') : t('settingsPage.platform.chaosOff'),
		},
		{ label: t('settingsPage.platform.healthInterval'), value: formatDurationMs(settings.systemHealthCheckIntervalMs) },
		{ label: t('settingsPage.platform.aiProvider'), value: AI_PROVIDER_LABELS[settings.ai.provider] },
		{
			label: t('settingsPage.platform.aiModel'),
			value: settings.ai.modelId ?? t('settingsPage.platform.notSet'),
			isMissing: settings.ai.modelId === null,
		},
		{ label: t('settingsPage.platform.consoleWs'), value: settings.realtime.consoleWebSocketUrl },
	];
}
