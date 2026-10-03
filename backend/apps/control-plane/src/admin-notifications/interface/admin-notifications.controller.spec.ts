import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AdminNotificationsService } from '../application/admin-notifications.service.js';
import { AdminNotificationsController } from './admin-notifications.controller.js';

const PAGE = { items: [], nextCursor: null, unreadCount: 0 };

function buildService(): AdminNotificationsService {
	return {
		list: vi.fn().mockResolvedValue(PAGE),
		setRead: vi.fn().mockResolvedValue(undefined),
		markAllRead: vi.fn().mockResolvedValue(4),
	} as unknown as AdminNotificationsService;
}

describe('AdminNotificationsController', () => {
	let service: AdminNotificationsService;
	let controller: AdminNotificationsController;

	beforeEach(() => {
		service = buildService();
		controller = new AdminNotificationsController(service);
	});

	it('splits the query into its filters and its page', async () => {
		await controller.list({ category: 'traffic', read: 'unread', cursor: undefined, limit: 20 } as never);

		expect(service.list).toHaveBeenCalledWith({ category: 'traffic', read: 'unread' }, { cursor: null, limit: 20 });
	});

	it('passes a cursor through as the page to continue from', async () => {
		const cursor = Buffer.from('2026-03-01T10:00:00.000Z|n1').toString('base64url');

		await controller.list({ cursor, limit: 10 } as never);

		expect(service.list).toHaveBeenCalledWith(
			{ category: undefined, read: undefined },
			{ cursor: { orderedAt: new Date('2026-03-01T10:00:00.000Z'), id: 'n1' }, limit: 10 },
		);
	});

	it('marks one row read and unread through the same service call', async () => {
		await controller.markRead({ id: 'n1' });
		await controller.markUnread({ id: 'n1' });

		expect(service.setRead).toHaveBeenNthCalledWith(1, 'n1', true);
		expect(service.setRead).toHaveBeenNthCalledWith(2, 'n1', false);
	});

	it('marks everything read without returning the count', async () => {
		expect(await controller.markAllRead()).toBeUndefined();
		expect(service.markAllRead).toHaveBeenCalled();
	});
});
