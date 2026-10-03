import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useNow } from '@/app/hooks/useNow';

import type { LiveDataState, LiveDataStatus } from './liveDataStatus';

import './LiveChartNote.css';

export type LiveChartNoteProps = {
	readonly status: LiveDataStatus;
	// What the chart covers ("últimos 60 min"), kept beside the state.
	readonly windowLabel: string;
};

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CLOCK_TICK_MS = 1000;

const LABEL_KEY_BY_STATE: Readonly<Record<LiveDataState, string>> = {
	live: 'liveChart.live',
	waiting: 'liveChart.waiting',
	stale: 'liveChart.stale',
	offline: 'liveChart.offline',
};

const TOOLTIP_KEY_BY_STATE: Readonly<Record<LiveDataState, string>> = {
	live: 'liveChart.liveTooltip',
	waiting: 'liveChart.waitingTooltip',
	stale: 'liveChart.staleTooltip',
	offline: 'liveChart.offlineTooltip',
};

export function LiveChartNote({ status, windowLabel }: LiveChartNoteProps): ReactElement {
	const { t } = useTranslation();
	const ageLabel = useAgeLabel(status);
	const isAgeShown = ageLabel !== null && status.state !== 'offline';

	return (
		<span className="live-chart-note">
			<span className={`live-chart-state is-${status.state}`} role="status" data-tooltip={t(TOOLTIP_KEY_BY_STATE[status.state])}>
				<span className="live-chart-dot" aria-hidden="true" />
				{t(LABEL_KEY_BY_STATE[status.state])}
				{isAgeShown && <span className="live-chart-age">· {ageLabel}</span>}
			</span>
			<span className="live-chart-window">{windowLabel}</span>
		</span>
	);
}

function useAgeLabel(status: LiveDataStatus): string | null {
	const { t } = useTranslation();
	// Its own one-second clock, so only this small badge re-renders to keep
	// "há 12s" counting, not the page and its charts.
	const now = useNow(CLOCK_TICK_MS);

	if (status.lastCollectedAt === null) {
		return null;
	}

	const ageSeconds = Math.max(0, Math.round((now - status.lastCollectedAt) / MS_PER_SECOND));

	if (ageSeconds < SECONDS_PER_MINUTE) {
		return t('liveChart.ageSeconds', { count: ageSeconds });
	}

	return t('liveChart.ageMinutes', { count: Math.floor(ageSeconds / SECONDS_PER_MINUTE) });
}
