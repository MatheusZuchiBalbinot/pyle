import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listAdminNotifications, markAllNotificationsRead, markNotificationRead } from '@/app/api/adminApiClient';
import type { AdminNotification, AdminNotificationCategory, AdminNotificationsPage, NotificationReadFilter } from '@/app/api/notificationTypes';
import { isDataChangingEvent, isEntityChange, toRealtimeEvent, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useRealtimeEvents } from '@/app/core/realtime/useRealtime';
import { useAsyncResource, type AsyncResourceState } from '@/app/hooks/useAsyncResource';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

export type NotificationsFilter = {
	readonly category: AdminNotificationCategory | 'all';
	readonly read: NotificationReadFilter;
};

export type UseAdminNotificationsResult = {
	readonly loadState: AsyncResourceState<AdminNotificationsPage>;
	readonly unreadCount: number;
	readonly hasMore: boolean;
	readonly setRead: (notification: AdminNotification, isRead: boolean) => Promise<void>;
	readonly markAllRead: () => Promise<void>;
};

// One page: the drawer is a triage surface, not an archive; hasMore says there is older
// history.
const INBOX_LIMIT = 100;

// A row for an event type this console does not know is left out rather than breaking the
// drawer.
export function withoutUnknownEvents(page: AdminNotificationsPage): AdminNotificationsPage {
	return { ...page, items: page.items.filter(hasKnownEvent) };
}

export function useAdminNotifications(filter: NotificationsFilter): UseAdminNotificationsResult {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const { category, read } = filter;
	const listFilter = useMemo(() => ({ category: category === 'all' ? undefined : category, read, limit: INBOX_LIMIT }), [category, read]);
	const load = useCallback(() => listAdminNotifications(listFilter).then(withoutUnknownEvents), [listFilter]);
	const { loadState, refetch } = useAsyncResource(load, {
		queryKey: queryKeys.notificationsInbox(listFilter),
		fallbackErrorMessage: t('notifications.loadError'),
		refetchOn: isInboxEvent,
	});
	const [optimisticUnread, setOptimisticUnread] = useState<number | null>(null);

	const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
		if (isDataChangingEvent(event)) {
			setOptimisticUnread(null);
		}
	}, []);

	useRealtimeEvents(handleRealtimeEvent);

	const serverUnread = loadState.status === LOAD_STATUS.loaded ? loadState.data.unreadCount : 0;
	const unreadCount = optimisticUnread ?? serverUnread;
	const hasMore = loadState.status === LOAD_STATUS.loaded && loadState.data.nextCursor !== null;

	const setRead = useCallback(
		async (notification: AdminNotification, isRead: boolean) => {
			if (notification.isRead === isRead) {
				return;
			}

			setOptimisticUnread(Math.max(serverUnread + (isRead ? -1 : 1), 0));

			try {
				await markNotificationRead(notification.id, isRead);
			} catch {
				toast(t('notifications.updateError'), 'danger');
			}

			setOptimisticUnread(null);
			await refetch();
		},
		[refetch, serverUnread, toast, t],
	);

	const markAllRead = useCallback(async () => {
		setOptimisticUnread(0);

		try {
			await markAllNotificationsRead();
		} catch {
			toast(t('notifications.updateError'), 'danger');
		}

		setOptimisticUnread(null);
		await refetch();
	}, [refetch, toast, t]);

	return { loadState, unreadCount, hasMore, setRead, markAllRead };
}

// No polling: refetched on every admin event (the backend persists the row before
// publishing). Read toggles are optimistic.
function isInboxEvent(event: RealtimeEvent): boolean {
	return isDataChangingEvent(event) || isEntityChange(event, ['AdminNotification']);
}

function hasKnownEvent(notification: AdminNotification): boolean {
	return toRealtimeEvent(notification.event) !== null;
}
