import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getSystemHealth, listOpenAlerts, listServices } from '@/app/api/adminApiClient';
import type { GatewayAlert, Service, ServiceInstance, SystemHealthComponentStatus } from '@/app/api/adminApiTypes';
import { isAlertEvent, isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useAsyncResource, type UseAsyncResourceOptions } from '@/app/hooks/useAsyncResource';
import { isInstanceInTrouble } from '@/app/lib/gatewayLabels';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import type { PageId } from '@/app/shell/Sidebar/navItems';

const NOTIFICATIONS_POLL_INTERVAL_MS = 30_000;

export type NotificationSeverity = 'info' | 'warning' | 'danger';

// Which read failed. Named rather than boolean so the row can say *what*
// could not be read.
export type NotificationSourceName = 'systemHealth' | 'alerts' | 'services';

// Live facts, not stored: each disappears once its condition clears.
export type NotificationItem =
	// Without this, an unreadable source would look like a healthy platform.
	| { readonly kind: 'source-unavailable'; readonly id: string; readonly source: NotificationSourceName }
	| { readonly kind: 'gateway-alert'; readonly id: string; readonly alert: GatewayAlert }
	| { readonly kind: 'instance-down'; readonly id: string; readonly service: Service; readonly instance: ServiceInstance }
	| { readonly kind: 'system-component'; readonly id: string; readonly component: SystemHealthComponentStatus };

export type NotificationTarget = { readonly page: PageId; readonly selection: ConsoleSelection | null };

export type NotificationsResult = {
	readonly items: readonly NotificationItem[];
	readonly dangerCount: number;
	readonly isLoaded: boolean;
	readonly refetch: () => Promise<void>;
};

export type NotificationSources = {
	readonly systemHealth: readonly SystemHealthComponentStatus[];
	readonly openAlerts: readonly GatewayAlert[];
	readonly services: readonly Service[];
	readonly unavailableSources: readonly NotificationSourceName[];
};

const EMPTY_SOURCES: NotificationSources = { systemHealth: [], openAlerts: [], services: [], unavailableSources: [] };

const SEVERITY_BY_KIND: Readonly<Record<NotificationItem['kind'], NotificationSeverity>> = {
	// Warning, not danger: not knowing is not the same as being down.
	'source-unavailable': 'warning',
	'gateway-alert': 'warning',
	'instance-down': 'danger',
	'system-component': 'danger',
};

const SOURCE_TARGET: Readonly<Record<NotificationSourceName, PageId>> = { systemHealth: 'overview', alerts: 'overview', services: 'services' };

const SEVERITY_ORDER: Readonly<Record<NotificationSeverity, number>> = { danger: 0, warning: 1, info: 2 };

export function toNotificationSeverity(item: NotificationItem): NotificationSeverity {
	if (item.kind === 'gateway-alert' && item.alert.severity === 'critical') {
		return 'danger';
	}

	if (item.kind === 'system-component' && item.component.status === 'degraded') {
		return 'warning';
	}

	return SEVERITY_BY_KIND[item.kind];
}

export function toNotificationTarget(item: NotificationItem): NotificationTarget {
	switch (item.kind) {
		case 'source-unavailable':
			return { page: SOURCE_TARGET[item.source], selection: null };
		case 'gateway-alert':
			return alertTarget(item.alert);
		case 'instance-down':
			return { page: 'services', selection: { type: 'service', serviceSlug: item.service.slug, instanceId: item.instance.id } };
		case 'system-component':
			return { page: 'overview', selection: null };
		default:
			return item satisfies never;
	}
}

export function buildNotifications(sources: NotificationSources): readonly NotificationItem[] {
	const items = [
		...unavailableSourceNotifications(sources.unavailableSources),
		...alertNotifications(sources.openAlerts),
		...instanceNotifications(sources.services),
		...systemNotifications(sources.systemHealth),
	];

	return items.sort(bySeverityThenId);
}

export function useNotifications(): NotificationsResult {
	const { t } = useTranslation();
	const load = useCallback(() => loadNotificationSources(), []);
	const options: UseAsyncResourceOptions<NotificationSources> = {
		queryKey: queryKeys.notificationsAttention(),
		fallbackErrorMessage: t('notifications.loadError'),
		pollIntervalMs: NOTIFICATIONS_POLL_INTERVAL_MS,
		refetchOn: isConditionEvent,
	};
	const { loadState, refetch } = useAsyncResource(load, options);

	const sources = loadState.status === LOAD_STATUS.loaded ? loadState.data : EMPTY_SOURCES;
	const items = useMemo(() => buildNotifications(sources), [sources]);
	const dangerCount = items.filter((item) => toNotificationSeverity(item) === 'danger').length;
	const isLoaded = loadState.status === LOAD_STATUS.loaded;

	return { items, dangerCount, isLoaded, refetch };
}

// Open alerts, instance state and platform health change exactly when one
// of these says so.
function isConditionEvent(event: RealtimeEvent): boolean {
	const isComponentEvent = event.type === 'system.component.changed' || isEntityChange(event, ['SystemHealthEvent']);
	const isInstanceEvent = event.type === 'instance.state.changed' || isEntityChange(event, ['Service', 'ServiceInstance']);

	return isAlertEvent(event) || isComponentEvent || isInstanceEvent || event.type === 'gateway.status.changed';
}

function alertTarget(alert: GatewayAlert): NotificationTarget {
	if (alert.subjectType === 'route') {
		return { page: 'traffic', selection: { type: 'route-traffic', routeId: alert.subjectId } };
	}

	return { page: 'services', selection: null };
}

// Out of the rotation for a reason the operator did not choose: a drained
// instance is intentional and not news.
function bySeverityThenId(a: NotificationItem, b: NotificationItem): number {
	const severityDelta = SEVERITY_ORDER[toNotificationSeverity(a)] - SEVERITY_ORDER[toNotificationSeverity(b)];

	if (severityDelta !== 0) {
		return severityDelta;
	}

	return a.id.localeCompare(b.id);
}

async function loadSource<T>(load: () => Promise<readonly T[]>): Promise<{ items: readonly T[]; isAvailable: boolean }> {
	try {
		return { items: await load(), isAvailable: true };
	} catch {
		return { items: [], isAvailable: false };
	}
}

async function loadNotificationSources(): Promise<NotificationSources> {
	const [systemHealth, openAlerts, services] = await Promise.all([loadSource(getSystemHealth), loadSource(listOpenAlerts), loadSource(listServices)]);
	const unavailableSources: NotificationSourceName[] = [];

	if (!systemHealth.isAvailable) {
		unavailableSources.push('systemHealth');
	}

	if (!openAlerts.isAvailable) {
		unavailableSources.push('alerts');
	}

	if (!services.isAvailable) {
		unavailableSources.push('services');
	}

	return { systemHealth: systemHealth.items, openAlerts: openAlerts.items, services: services.items, unavailableSources };
}

function instanceNotifications(services: readonly Service[]): readonly NotificationItem[] {
	return services.flatMap((service) =>
		service.instances
			.filter(isInstanceInTrouble)
			.map((instance): NotificationItem => ({ kind: 'instance-down', id: `instance:${instance.id}`, service, instance })),
	);
}

function alertNotifications(alerts: readonly GatewayAlert[]): readonly NotificationItem[] {
	return alerts.map((alert): NotificationItem => ({ kind: 'gateway-alert', id: `alert:${alert.id}`, alert }));
}

function systemNotifications(systemHealth: readonly SystemHealthComponentStatus[]): readonly NotificationItem[] {
	return systemHealth
		.filter((component) => component.status !== 'up')
		.map((component): NotificationItem => ({ kind: 'system-component', id: `system:${component.component}`, component }));
}

function unavailableSourceNotifications(sources: readonly NotificationSourceName[]): readonly NotificationItem[] {
	return sources.map((source): NotificationItem => ({ kind: 'source-unavailable', id: `source:${source}`, source }));
}
