import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AdminNotification, AdminNotificationsPage } from '@/app/api/notificationTypes';
import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildConsoleHarness } from '@/test/consoleHarness';

import { useAdminNotifications, withoutUnknownEvents, type NotificationsFilter } from './useAdminNotifications';

vi.mock('../../../api/adminApiClient', () => ({
	listAdminNotifications: vi.fn(),
	markNotificationRead: vi.fn(),
	markAllNotificationsRead: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const { listAdminNotifications, markAllNotificationsRead, markNotificationRead } = await import('../../../api/adminApiClient');

const INBOX_LIMIT = 100;
const AT = '2026-03-01T10:00:00.000Z';
const ALL: NotificationsFilter = { category: 'all', read: 'all' };
const GATEWAY_DOWN: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT };

function buildNotification(id: string, isRead = false): AdminNotification {
	const event: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT };

	return { id, category: 'system', severity: 'info', event, isRead, readAt: isRead ? AT : null, createdAt: AT };
}

function buildPage(overrides: Partial<AdminNotificationsPage> = {}): AdminNotificationsPage {
	return { items: [buildNotification('n1')], nextCursor: null, unreadCount: 1, ...overrides } as AdminNotificationsPage;
}

function renderInbox(filter: NotificationsFilter = ALL) {
	const harness = buildConsoleHarness();
	const rendered = renderHook(() => useAdminNotifications(filter), { wrapper: harness.wrapper });

	return { ...rendered, harness };
}

describe('useAdminNotifications', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('loads one page of the inbox and reports the unread count', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 3 }));

		const { result } = renderInbox();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		expect(result.current.unreadCount).toBe(3);
		expect(listAdminNotifications).toHaveBeenCalledWith({ category: undefined, read: 'all', limit: INBOX_LIMIT });
	});

	it('passes a chosen category through and leaves "all" as no filter', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage());

		const { result } = renderInbox({ category: 'traffic', read: 'unread' });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		expect(listAdminNotifications).toHaveBeenCalledWith({ category: 'traffic', read: 'unread', limit: INBOX_LIMIT });
	});

	it('tells the operator there is older history beyond this page', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ nextCursor: 'abc' }));

		const { result } = renderInbox();

		await waitFor(() => expect(result.current.hasMore).toBe(true));
	});

	it('reports no more when the page is the whole list', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage());

		const { result } = renderInbox();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		expect(result.current.hasMore).toBe(false);
	});

	describe('marking read', () => {
		it('drops the badge before the server answers, then refetches', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 2 }));
			vi.mocked(markNotificationRead).mockResolvedValue(undefined);
			const { result } = renderInbox();

			await waitFor(() => expect(result.current.unreadCount).toBe(2));

			await act(async () => {
				await result.current.setRead(buildNotification('n1'), true);
			});

			expect(markNotificationRead).toHaveBeenCalledWith('n1', true);
			expect(listAdminNotifications).toHaveBeenCalledTimes(2);
		});

		it('raises the badge back when a row is marked unread', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 0 }));
			vi.mocked(markNotificationRead).mockResolvedValue(undefined);
			const { result } = renderInbox();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				await result.current.setRead(buildNotification('n1', true), false);
			});

			expect(markNotificationRead).toHaveBeenCalledWith('n1', false);
		});

		it('does nothing at all when the row is already in the state asked for', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage());
			const { result } = renderInbox();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				await result.current.setRead(buildNotification('n1', true), true);
			});

			expect(markNotificationRead).not.toHaveBeenCalled();
			expect(listAdminNotifications).toHaveBeenCalledTimes(1);
		});

		it('tells the operator when the update failed, and still reconciles with the server', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 2 }));
			vi.mocked(markNotificationRead).mockRejectedValue(new Error('offline'));
			const { result, harness } = renderInbox();

			await waitFor(() => expect(result.current.unreadCount).toBe(2));

			await act(async () => {
				await result.current.setRead(buildNotification('n1'), true);
			});

			expect(harness.toasts()).toEqual([{ message: 'notifications.updateError', tone: 'danger' }]);
			expect(result.current.unreadCount).toBe(2);
		});
	});

	describe('marking everything read', () => {
		it('empties the badge immediately, then refetches', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 5 }));
			vi.mocked(markAllNotificationsRead).mockResolvedValue(undefined);
			const { result } = renderInbox();

			await waitFor(() => expect(result.current.unreadCount).toBe(5));

			await act(async () => {
				await result.current.markAllRead();
			});

			expect(markAllNotificationsRead).toHaveBeenCalled();
			expect(listAdminNotifications).toHaveBeenCalledTimes(2);
		});

		it('reports a failure instead of leaving the badge falsely empty', async () => {
			vi.mocked(listAdminNotifications).mockResolvedValue(buildPage({ unreadCount: 5 }));
			vi.mocked(markAllNotificationsRead).mockRejectedValue(new Error('offline'));
			const { result, harness } = renderInbox();

			await waitFor(() => expect(result.current.unreadCount).toBe(5));

			await act(async () => {
				await result.current.markAllRead();
			});

			expect(harness.toasts()).toEqual([{ message: 'notifications.updateError', tone: 'danger' }]);
			expect(result.current.unreadCount).toBe(5);
		});
	});

	it('refetches when a new row is announced, since the backend persisted it before publishing', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage());
		const { result, harness } = renderInbox();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit(GATEWAY_DOWN);
		});

		await waitFor(() => expect(listAdminNotifications).toHaveBeenCalledTimes(2));
	});

	it('refetches on a write to the notification table, such as a read mark from another tab', async () => {
		vi.mocked(listAdminNotifications).mockResolvedValue(buildPage());
		const { result, harness } = renderInbox();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'entity.changed', entity: 'AdminNotification', action: 'updated', id: null, occurredAt: AT });
		});

		await waitFor(() => expect(listAdminNotifications).toHaveBeenCalledTimes(2));
	});
});

describe('withoutUnknownEvents', () => {
	it('drops rows whose event this console no longer knows, keeping the rest', () => {
		const stale = { ...buildNotification('old'), event: { type: 'report.weekly.ready', occurredAt: AT } as unknown as RealtimeEvent };
		const page = buildPage({ items: [buildNotification('n1'), stale] });

		expect(withoutUnknownEvents(page).items.map((item) => item.id)).toEqual(['n1']);
	});
});
