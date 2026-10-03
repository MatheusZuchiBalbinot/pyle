import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Skeleton } from '@/app/ui/Skeleton/Skeleton';
import { StatusBadge } from '@/app/ui/StatusBadge/StatusBadge';

import './SystemHealthPanel.css';

import type { SystemHealthComponentStatus } from '@/app/api/adminApiTypes';
import { isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { systemHealthQuery } from '@/app/features/settings/lib/settingsQueries';
import { useAsyncResource, type UseAsyncResourceOptions } from '@/app/hooks/useAsyncResource';
import { SYSTEM_COMPONENT_LABELS } from '@/app/lib/adminLabels';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

type SystemHealthPanelSkeletonProps = { readonly title: string; readonly note: string; readonly rowCount: number };

const SYSTEM_HEALTH_POLL_INTERVAL_MS = 10_000;

// One row per checked component.
const SYSTEM_COMPONENT_COUNT = Object.keys(SYSTEM_COMPONENT_LABELS).length;

const SKELETON_NAME_WIDTH = '96px';
const SKELETON_BADGE_WIDTH = '64px';

export function SystemHealthPanel(): ReactElement {
	const { t } = useTranslation();
	const query = systemHealthQuery();
	const options: UseAsyncResourceOptions<readonly SystemHealthComponentStatus[]> = {
		queryKey: query.queryKey,
		fallbackErrorMessage: t('systemHealthPanel.loadError'),
		pollIntervalMs: SYSTEM_HEALTH_POLL_INTERVAL_MS,
		refetchOn: isSystemHealthEvent,
	};
	const { loadState } = useAsyncResource(query.queryFn, options);

	if (loadState.status === LOAD_STATUS.loading) {
		return <SystemHealthPanelSkeleton title={t('systemHealthPanel.title')} note={t('systemHealthPanel.note')} rowCount={SYSTEM_COMPONENT_COUNT} />;
	}

	if (loadState.status === LOAD_STATUS.error) {
		return <div className="panel error-state">{loadState.message}</div>;
	}

	return (
		<div className="panel">
			<div className="panel-header">
				<span className="panel-title">{t('systemHealthPanel.title')}</span>
				<span className="panel-note">{t('systemHealthPanel.note')}</span>
			</div>
			{loadState.data.map((component) => (
				<div key={component.component} className="health-row">
					<span className="health-name">{SYSTEM_COMPONENT_LABELS[component.component]}</span>
					<span className="health-detail">{component.detail ?? ''}</span>
					<StatusBadge status={component.status} />
				</div>
			))}
		</div>
	);
}

function isSystemHealthEvent(event: RealtimeEvent): boolean {
	return event.type === 'system.component.changed' || isEntityChange(event, ['SystemHealthEvent']);
}

function SystemHealthPanelSkeleton({ title, note, rowCount }: SystemHealthPanelSkeletonProps): ReactElement {
	const rows = Array.from({ length: rowCount }, (_, index) => index);

	return (
		<div className="panel" aria-busy="true">
			<div className="panel-header">
				<span className="panel-title">{title}</span>
				<span className="panel-note">{note}</span>
			</div>
			{rows.map((row) => (
				<div key={row} className="health-row">
					<Skeleton width={SKELETON_NAME_WIDTH} />
					<span />
					<Skeleton width={SKELETON_BADGE_WIDTH} />
				</div>
			))}
		</div>
	);
}
