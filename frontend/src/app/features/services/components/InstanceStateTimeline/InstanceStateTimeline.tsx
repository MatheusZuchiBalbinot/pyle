import { History } from 'lucide-react';
import { useCallback, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { listConfigActivity } from '@/app/api/adminApiClient';
import type { ConfigChangeAction, ConfigChangeEvent } from '@/app/api/adminApiTypes';
import type { InstanceStateName, RealtimeEvent } from '@/app/api/realtimeEvents';
import type { TimelineEntry } from '@/app/features/services/hooks/useServiceLiveState';
import { isInstanceChangeEvent } from '@/app/features/services/lib/instanceChangeEvents';
import { useAsyncResource, type UseAsyncResourceOptions } from '@/app/hooks/useAsyncResource';
import { useNow } from '@/app/hooks/useNow';
import { describeConfigChange } from '@/app/lib/describeConfigChange';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { formatRelativeTime } from '@/app/lib/relativeTime';
import { describeReason } from '@/app/lib/stateReason';

import '@/app/ui/DetailPanel/DetailPanel.css';
import './InstanceStateTimeline.css';

import { queryKeys } from '@/app/core/query/queryKeys';

type ActivityTone = 'good' | 'bad' | 'neutral' | 'info';

const CHANGES_SHOWN = 5;
const TONE_BY_STATE: Readonly<Record<InstanceStateName, ActivityTone>> = {
	healthy: 'good',
	unhealthy: 'bad',
	circuit_closed: 'good',
	circuit_open: 'bad',
	circuit_half_open: 'neutral',
};
const TONE_BY_ACTION: Readonly<Record<ConfigChangeAction, ActivityTone>> = { created: 'good', updated: 'info', deleted: 'bad' };
const CLOCK_MS = 30_000;

export type InstanceStateTimelineProps = { readonly instanceId: string; readonly entries: readonly TimelineEntry[] };

export function InstanceStateTimeline({ instanceId, entries }: InstanceStateTimelineProps): ReactElement {
	const { t, i18n } = useTranslation();
	const nowMs = useNow(CLOCK_MS);
	const loadChanges = useCallback(async (): Promise<readonly ConfigChangeEvent[]> => {
		const page = await listConfigActivity({ entityType: 'instance', entityId: instanceId }, { limit: CHANGES_SHOWN });

		return page.items;
	}, [instanceId]);
	const isChangeToThisInstance = useCallback((event: RealtimeEvent): boolean => isInstanceChangeEvent(event, instanceId), [instanceId]);
	const changesOptions: UseAsyncResourceOptions<readonly ConfigChangeEvent[]> = {
		queryKey: queryKeys.instanceChanges(instanceId),
		fallbackErrorMessage: t('services.timeline.changesError'),
		refetchOn: isChangeToThisInstance,
	};
	const changes = useAsyncResource(loadChanges, changesOptions).loadState;

	return (
		<section className="instance-activity" aria-label={t('services.timeline.activity')}>
			<header className="detail-section-head">
				<h4>
					<History size={14} aria-hidden="true" />
					{t('services.timeline.activity')}
				</h4>
			</header>
			<div className="activity-group">
				<h5 className="activity-group-title">
					{t('services.timeline.title')}
					<span>{t('services.timeline.sinceOpened')}</span>
				</h5>
				<ol className="activity-list">
					{entries.length === 0 && <li className="activity-empty">{t('services.timeline.noStateChanges')}</li>}
					{entries.map((entry) => (
						<li key={`${entry.occurredAt}:${entry.kind}:${entry.toState}`} className={`activity-row is-${toneOfState(entry.toState)}`}>
							<span className="activity-dot" aria-hidden="true" />
							<span className="activity-text">
								<strong>{t(`services.timeline.state.${entry.toState}`)}</strong> {describeReason(entry.reason, t)}
							</span>
							<time className="activity-time" dateTime={entry.occurredAt}>
								{formatRelativeTime(entry.occurredAt, nowMs, i18n.language)}
							</time>
						</li>
					))}
				</ol>
			</div>
			<div className="activity-group">
				<h5 className="activity-group-title">{t('services.timeline.changes')}</h5>
				<ol className="activity-list">
					{changes.status === LOAD_STATUS.loaded && changes.data.length === 0 && (
						<li className="activity-empty">{t('services.timeline.noChanges')}</li>
					)}
					{changes.status === LOAD_STATUS.error && <li className="activity-empty">{changes.message}</li>}
					{changes.status === LOAD_STATUS.loaded &&
						changes.data.map((change) => (
							<li key={change.id} className={`activity-row is-${toneOfAction(change.action)}`}>
								<span className="activity-dot" aria-hidden="true" />
								<span className="activity-text">
									<strong>{t(`overviewPage.changes.action.${change.action}`)}</strong> {describeConfigChange(change, t)}
								</span>
								<time className="activity-time" dateTime={change.occurredAt}>
									{formatRelativeTime(change.occurredAt, nowMs, i18n.language)}
								</time>
							</li>
						))}
				</ol>
			</div>
		</section>
	);
}

function toneOfState(state: InstanceStateName): ActivityTone {
	return TONE_BY_STATE[state];
}

function toneOfAction(action: ConfigChangeAction): ActivityTone {
	return TONE_BY_ACTION[action];
}
