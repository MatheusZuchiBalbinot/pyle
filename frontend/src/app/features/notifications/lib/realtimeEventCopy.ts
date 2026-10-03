import type { TFunction } from 'i18next';

import type { GatewayStatusChange, RealtimeEvent } from '@/app/api/realtimeEvents';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { ALERT_KIND_LABEL_KEYS, SYSTEM_COMPONENT_LABELS } from '@/app/lib/adminLabels';
import { assertUnreachable } from '@/app/lib/assertUnreachable';
import { describeConfigChangeDetail } from '@/app/lib/describeConfigChange';
import { describeReason } from '@/app/lib/stateReason';
import type { PageId } from '@/app/shell/Sidebar/navItems';

export type RealtimeEventTone = 'info' | 'success' | 'warning' | 'danger';

export type RealtimeEventCopy = {
	readonly title: string;
	readonly detail: string;
	readonly tone: RealtimeEventTone;
	// Where clicking the inbox entry takes the user; `selection`, when set,
	// opens that entity on its page instead.
	readonly targetPage: PageId;
	readonly selection?: ConsoleSelection;
	// Set for `ai.analysis.ready`: the inbox opens that analysis.
	readonly analysisId?: string;
	// Whether the event also deserves a toast, not just an inbox entry.
	readonly isProminent: boolean;
};

type InstanceStateEvent = Extract<RealtimeEvent, { readonly type: 'instance.state.changed' }>;
type AlertTriggeredEvent = Extract<RealtimeEvent, { readonly type: 'alert.triggered' }>;
type AlertSubject = Pick<AlertTriggeredEvent, 'subjectType' | 'subjectId'>;

const GATEWAY_STATUS_TONE: Readonly<Record<GatewayStatusChange, RealtimeEventTone>> = { up: 'success', stopped: 'info', down: 'danger' };

const TONE_BY_INSTANCE_STATE: Readonly<Record<InstanceStateEvent['toState'], RealtimeEventTone>> = {
	healthy: 'success',
	unhealthy: 'danger',
	circuit_closed: 'success',
	circuit_open: 'danger',
	circuit_half_open: 'warning',
};

// Shared by inbox rows and toasts, so a fact never reads two ways.
export function toRealtimeEventCopy(event: RealtimeEvent, t: TFunction): RealtimeEventCopy {
	switch (event.type) {
		case 'instance.state.changed':
			return toInstanceStateCopy(event, t);
		case 'alert.triggered':
			return toAlertTriggeredCopy(event, t);
		case 'alert.resolved':
			return {
				title: t('realtimeEvents.alertResolved.title', { subject: event.subjectName, kind: t(ALERT_KIND_LABEL_KEYS[event.kind]) }),
				detail: t('realtimeEvents.alertResolved.detail'),
				tone: 'success',
				...alertTarget(event),
				isProminent: false,
			};
		case 'gateway.status.changed':
			return {
				title: t(`realtimeEvents.gatewayStatus.${event.status}`, { gateway: event.gatewayId }),
				detail: t(`realtimeEvents.gatewayStatus.${event.status}Detail`),
				tone: GATEWAY_STATUS_TONE[event.status],
				targetPage: 'overview',
				isProminent: event.status === 'down',
			};
		case 'chaos.changed':
			return {
				title: t('realtimeEvents.chaosChanged.title', { instance: event.instanceName }),
				detail: t('realtimeEvents.chaosChanged.detail'),
				tone: 'info',
				targetPage: 'services',
				selection: instanceSelection(event.serviceSlug, event.instanceId),
				isProminent: false,
			};

		case 'system.component.changed': {
			const isUp = event.status === 'up';
			const titleParams = { name: SYSTEM_COMPONENT_LABELS[event.component], status: t(`statusBadge.${event.status}`) };

			return {
				title: t('realtimeEvents.systemComponentChanged.title', titleParams),
				detail: event.detail ?? '',
				tone: isUp ? 'success' : 'danger',
				targetPage: 'overview',
				isProminent: !isUp,
			};
		}

		case 'ai.analysis.ready': {
			const subject = event.subjectName ?? t('aiAnalysis.platformSubject');
			const detailParams = { scope: t(`aiAnalysis.scope.${event.scope}`), risk: t(`aiAnalysis.risk.${event.riskLevel}`) };

			return {
				title: t('realtimeEvents.analysisReady.title', { subject }),
				detail: t('realtimeEvents.analysisReady.detail', detailParams),
				tone: event.riskLevel === 'high' ? 'danger' : 'info',
				targetPage: 'ai',
				analysisId: event.analysisId,
				isProminent: false,
			};
		}

		case 'config.changed':
			return {
				title: t('realtimeEvents.configChanged.title', { entity: t(`realtimeEvents.configEntity.${event.entityType}`) }),
				detail: describeConfigChangeDetail(event.detail, t) ?? '',
				tone: 'info',
				targetPage: 'overview',
				isProminent: false,
			};
		case 'traffic.collected':
			return { title: t('realtimeEvents.trafficCollected.title'), detail: '', tone: 'info', targetPage: 'traffic', isProminent: false };
		case 'entity.changed':
			return {
				title: t('realtimeEvents.entityChanged.title', { entity: event.entity }),
				detail: event.action,
				tone: 'info',
				targetPage: 'overview',
				isProminent: false,
			};
		default:
			return assertUnreachable(event);
	}
}

function instanceSelection(serviceSlug: string, instanceId: string): ConsoleSelection {
	return { type: 'service', serviceSlug, instanceId };
}

// A route alert opens the route's traffic; an instance or service alert
// opens the Services page (the event carries no service slug for them).
function alertTarget(subject: AlertSubject): Pick<RealtimeEventCopy, 'targetPage' | 'selection'> {
	if (subject.subjectType === 'route') {
		return { targetPage: 'traffic', selection: { type: 'route-traffic', routeId: subject.subjectId } };
	}

	return { targetPage: 'services' };
}

function toInstanceStateCopy(event: InstanceStateEvent, t: TFunction): RealtimeEventCopy {
	const tone = TONE_BY_INSTANCE_STATE[event.toState];

	return {
		title: t(`realtimeEvents.instanceState.${event.toState}`, { instance: event.instanceName, service: event.serviceSlug }),
		detail: describeReason(event.reason, t),
		tone,
		targetPage: 'services',
		selection: instanceSelection(event.serviceSlug, event.instanceId),
		isProminent: tone === 'danger',
	};
}

function toAlertTriggeredCopy(event: AlertTriggeredEvent, t: TFunction): RealtimeEventCopy {
	const isCritical = event.severity === 'critical';

	return {
		title: t('realtimeEvents.alertTriggered.title', { subject: event.subjectName, kind: t(ALERT_KIND_LABEL_KEYS[event.kind]) }),
		detail: t('realtimeEvents.alertTriggered.detail'),
		tone: isCritical ? 'danger' : 'warning',
		...alertTarget(event),
		isProminent: isCritical,
	};
}
