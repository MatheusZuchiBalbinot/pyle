import type { RealtimeEvent } from './realtimeEvents';

// Separate from adminApiTypes to keep the import one-way (realtimeEvents imports
// adminApiTypes).
export type AdminNotificationCategory = 'traffic' | 'instance' | 'system' | 'ai';
export type AdminNotificationSeverity = 'info' | 'success' | 'warning' | 'danger';
export type NotificationReadFilter = 'unread' | 'read' | 'all';

export type AdminNotification = {
	readonly id: string;
	readonly category: AdminNotificationCategory;
	readonly severity: AdminNotificationSeverity;
	readonly event: RealtimeEvent;
	readonly isRead: boolean;
	readonly readAt: string | null;
	readonly createdAt: string;
};

export type AdminNotificationsPage = {
	readonly items: readonly AdminNotification[];
	readonly nextCursor: string | null;
	// The whole inbox's unread total, not this page's.
	readonly unreadCount: number;
};

export type ListAdminNotificationsFilter = {
	readonly category?: AdminNotificationCategory;
	readonly read?: NotificationReadFilter;
	readonly cursor?: string;
	readonly limit?: number;
};
