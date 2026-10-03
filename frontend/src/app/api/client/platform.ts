import type { AdminOverview, PlatformSettings, SystemHealthComponentStatus } from '../adminApiTypes';
import type { AdminNotificationsPage, ListAdminNotificationsFilter } from '../notificationTypes';
import type { RealtimeConnection } from '../realtimeEvents';
import { appendPageQuery, requestJson, requestNoContent, toQuery } from './request';

export function getPlatformSettings(): Promise<PlatformSettings> {
	return requestJson('/admin/settings/platform');
}

export function getSystemHealth(): Promise<readonly SystemHealthComponentStatus[]> {
	return requestJson('/admin/system/health');
}

export function getAdminOverview(): Promise<AdminOverview> {
	return requestJson('/admin/overview');
}

export function listAdminNotifications(filter: ListAdminNotificationsFilter): Promise<AdminNotificationsPage> {
	const params = new URLSearchParams();

	if (filter.category) {
		params.set('category', filter.category);
	}

	if (filter.read) {
		params.set('read', filter.read);
	}

	appendPageQuery(params, filter);

	return requestJson(`/admin/notifications${toQuery(params)}`);
}

export function markNotificationRead(id: string, isRead: boolean): Promise<void> {
	return requestNoContent(`/admin/notifications/${encodeURIComponent(id)}/${isRead ? 'read' : 'unread'}`, { method: 'POST' });
}

export function markAllNotificationsRead(): Promise<void> {
	return requestNoContent('/admin/notifications/read-all', { method: 'POST' });
}

export function mintRealtimeConnection(): Promise<RealtimeConnection> {
	return requestJson('/admin/realtime/token', { method: 'POST' });
}
