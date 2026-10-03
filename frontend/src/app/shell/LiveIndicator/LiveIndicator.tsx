import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { RealtimeConnectionState } from '@/app/core/realtime/realtimeContext';
import { useRealtime } from '@/app/core/realtime/useRealtime';

import './LiveIndicator.css';

const LABEL_KEY_BY_STATE: Readonly<Record<RealtimeConnectionState, string>> = {
	connecting: 'realtime.connecting',
	connected: 'realtime.connected',
	reconnecting: 'realtime.reconnecting',
	offline: 'realtime.offline',
};

const TOOLTIP_KEY_BY_STATE: Readonly<Record<RealtimeConnectionState, string>> = {
	connecting: 'realtime.connectingTooltip',
	connected: 'realtime.connectedTooltip',
	reconnecting: 'realtime.reconnectingTooltip',
	offline: 'realtime.offlineTooltip',
};

export function LiveIndicator(): ReactElement {
	const { t } = useTranslation();
	const { connectionState } = useRealtime();

	return (
		<span className={`live-indicator is-${connectionState}`} role="status" data-tooltip={t(TOOLTIP_KEY_BY_STATE[connectionState])}>
			<span className="live-indicator-dot" aria-hidden="true" />
			{t(LABEL_KEY_BY_STATE[connectionState])}
		</span>
	);
}
