import { NotFoundException } from '@nestjs/common';
import type { AdminNotification } from '@prisma/control-plane-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageRequest } from '../../common/pagination.js';
import type { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { RealtimeEvent } from '../../realtime/domain/realtime-event.js';
import type { AdminNotificationRepository } from '../infrastructure/admin-notification.repository.js';
import { AdminNotificationsService } from './admin-notifications.service.js';

const AT = '2026-03-01T10:00:00.000Z';
const PAGE: PageRequest = { cursor: null, limit: 50 };
const INSTANCE_DOWN: RealtimeEvent = {
	type: 'instance.state.changed',
	serviceId: 's1',
	serviceSlug: 'orders',
	instanceId: 'i1',
	instanceName: 'orders-2',
	kind: 'health',
	toState: 'unhealthy',
	reason: '3 consecutive failed health checks (HTTP 503)',
	occurredAt: AT,
};

const STORED_INSTANCE_DOWN = { ...INSTANCE_DOWN };

type Fakes = {
	readonly repository: AdminNotificationRepository;
	readonly realtimePublisher: RealtimePublisherService;
	emitAdminEvent(event: RealtimeEvent): Promise<void>;
};

function buildRow(id: string, payload: AdminNotification['payload'] = STORED_INSTANCE_DOWN): AdminNotification {
	return {
		id,
		category: 'instance',
		severity: 'danger',
		eventType: 'instance.state.changed',
		subjectType: 'instance',
		subjectId: 'i1',
		payload,
		readAt: null,
		createdAt: new Date(AT),
	} as AdminNotification;
}

function buildFakes(): Fakes {
	let listener: ((event: RealtimeEvent) => void | Promise<void>) | undefined;
	const fakes: Fakes = {
		repository: {
			listPage: vi.fn().mockResolvedValue({ items: [buildRow('n1')], nextCursor: 'next' }),
			countUnread: vi.fn().mockResolvedValue(3),
			findById: vi.fn().mockResolvedValue(buildRow('n1')),
			markRead: vi.fn().mockResolvedValue(undefined),
			markAllRead: vi.fn().mockResolvedValue(7),
			create: vi.fn().mockResolvedValue(buildRow('n2')),
		} as unknown as AdminNotificationRepository,
		realtimePublisher: {
			onAdminEvent: vi.fn().mockImplementation((handler: (event: RealtimeEvent) => void) => {
				listener = handler;

				return () => {
					listener = undefined;
				};
			}),
		} as unknown as RealtimePublisherService,
		emitAdminEvent: async (event) => {
			await listener?.(event);
		},
	};

	return fakes;
}

function buildInitializedService(fakes: Fakes): AdminNotificationsService {
	const service = new AdminNotificationsService(fakes.repository, fakes.realtimePublisher);

	service.onModuleInit();

	return service;
}

describe('AdminNotificationsService', () => {
	let fakes: Fakes;

	beforeEach(() => {
		fakes = buildFakes();
	});

	describe('list', () => {
		it('returns the page with the unread count of the whole inbox', async () => {
			const result = await buildInitializedService(fakes).list({}, PAGE);

			expect(result).toEqual({ items: [expect.objectContaining({ id: 'n1' })], nextCursor: 'next', unreadCount: 3 });
		});

		// A seeded row may not be an event at all.
		it('drops a row whose payload is not an event instead of passing it on', async () => {
			fakes.repository.listPage = vi.fn().mockResolvedValue({ items: [buildRow('n1'), buildRow('broken', {})], nextCursor: null });

			const result = await buildInitializedService(fakes).list({}, PAGE);

			expect(result.items.map((item) => item.id)).toEqual(['n1']);
		});

		it('defaults to showing read and unread alike', async () => {
			await buildInitializedService(fakes).list({}, PAGE);

			expect(fakes.repository.listPage).toHaveBeenCalledWith({ category: undefined, read: 'all' }, PAGE);
		});

		it('passes the filters the caller asked for', async () => {
			await buildInitializedService(fakes).list({ category: 'traffic', read: 'unread' }, PAGE);

			expect(fakes.repository.listPage).toHaveBeenCalledWith({ category: 'traffic', read: 'unread' }, PAGE);
		});
	});

	describe('read state', () => {
		it('marks one row read', async () => {
			await buildInitializedService(fakes).setRead('n1', true);

			expect(fakes.repository.markRead).toHaveBeenCalledWith('n1', true);
		});

		it('raises a not-found for an id that does not exist, instead of silently doing nothing', async () => {
			fakes.repository.findById = vi.fn().mockResolvedValue(null);

			await expect(buildInitializedService(fakes).setRead('ghost', true)).rejects.toThrow(NotFoundException);
			expect(fakes.repository.markRead).not.toHaveBeenCalled();
		});

		it('reports how many rows marking everything read touched', async () => {
			expect(await buildInitializedService(fakes).markAllRead()).toBe(7);
		});
	});

	describe('recording events', () => {
		it('writes an inbox row for an event that deserves one, with its subject', async () => {
			buildInitializedService(fakes);

			await fakes.emitAdminEvent(INSTANCE_DOWN);

			expect(fakes.repository.create).toHaveBeenCalledWith({
				category: 'instance',
				severity: 'danger',
				eventType: 'instance.state.changed',
				subjectType: 'instance',
				subjectId: 'i1',
				payload: INSTANCE_DOWN,
			});
		});

		it('writes no row for an event the classifier drops', async () => {
			buildInitializedService(fakes);

			await fakes.emitAdminEvent({ type: 'traffic.collected', bucketStart: AT, routeIds: [], bucketMs: 10_000, occurredAt: AT });

			expect(fakes.repository.create).not.toHaveBeenCalled();
		});

		it('records a platform-wide event with no subject attached', async () => {
			buildInitializedService(fakes);

			await fakes.emitAdminEvent({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT });

			expect(fakes.repository.create).toHaveBeenCalledWith(expect.objectContaining({ subjectType: null, subjectId: null }));
		});

		it('swallows a failed inbox write instead of breaking the event', async () => {
			fakes.repository.create = vi.fn().mockRejectedValue(new Error('inbox table locked'));
			buildInitializedService(fakes);

			await expect(fakes.emitAdminEvent(INSTANCE_DOWN)).resolves.toBeUndefined();
		});
	});
});
