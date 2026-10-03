import type { AdminNotificationCategory, AdminNotificationSeverity } from '@prisma/control-plane-client';

import type { AlertSubjectTypeName } from '@pyle/shared/contracts/names.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';

import type { GatewayStatusChange, RealtimeEvent } from '../../realtime/domain/realtime-event.js';

// A clean shutdown is news; a gateway gone silent is the alarm.
const GATEWAY_STATUS_SEVERITY: Readonly<Record<GatewayStatusChange, AdminNotificationSeverity>> = { up: 'success', stopped: 'info', down: 'danger' };

type NotificationSubject = { readonly type: AlertSubjectTypeName; readonly id: string };

type NotificationClassification = {
	readonly category: AdminNotificationCategory;
	readonly severity: AdminNotificationSeverity;
	// What the row is about, so the console can open it; null for
	// platform-wide events.
	readonly subject: NotificationSubject | null;
};

type InstanceStateChangedEvent = Extract<RealtimeEvent, { type: 'instance.state.changed' }>;

const DEGRADED_INSTANCE_STATES: ReadonlySet<string> = new Set(['unhealthy', 'circuit_open']);
const RECOVERED_INSTANCE_STATES: ReadonlySet<string> = new Set(['healthy', 'circuit_closed']);

// Traffic ticks and config edits are live-only: the pages already show them.
export function classifyNotification(event: RealtimeEvent): NotificationClassification | null {
	switch (event.type) {
		case 'traffic.collected':
		case 'entity.changed':
		case 'config.changed':
			return null;
		case 'instance.state.changed':
			return classifyInstanceStateChange(event);

		case 'alert.triggered': {
			const severity = event.severity === 'critical' ? 'danger' : 'warning';

			return { category: 'traffic', severity, subject: { type: event.subjectType, id: event.subjectId } };
		}

		case 'alert.resolved':
			return { category: 'traffic', severity: 'success', subject: { type: event.subjectType, id: event.subjectId } };
		case 'gateway.status.changed':
			return { category: 'system', severity: GATEWAY_STATUS_SEVERITY[event.status], subject: null };
		case 'chaos.changed':
			return { category: 'system', severity: 'info', subject: { type: 'instance', id: event.instanceId } };
		case 'system.component.changed':
			return { category: 'system', severity: event.status === 'up' ? 'success' : 'danger', subject: null };
		case 'ai.analysis.ready':
			return { category: 'ai', severity: event.riskLevel === 'high' ? 'danger' : 'info', subject: null };
		default:
			return assertUnreachable(event);
	}
}

// A half-open circuit is a transient probe, not news: only the outcome is.
function classifyInstanceStateChange(event: InstanceStateChangedEvent): NotificationClassification | null {
	const subject: NotificationSubject = { type: 'instance', id: event.instanceId };

	if (DEGRADED_INSTANCE_STATES.has(event.toState)) {
		return { category: 'instance', severity: 'danger', subject };
	}

	if (RECOVERED_INSTANCE_STATES.has(event.toState)) {
		return { category: 'instance', severity: 'success', subject };
	}

	return null;
}
