import { Test, type TestingModule } from '@nestjs/testing';
import type { AdminNotification } from '@prisma/control-plane-client';

import { AdminNotificationRepository } from '../../apps/control-plane/src/admin-notifications/infrastructure/admin-notification.repository.js';
import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { decodeCursor, type PageRequest } from '../../apps/control-plane/src/common/pagination.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';

// Keyset pagination is only worth testing against a real ordering: the
// tie-break on (createdAt, id) exists precisely for rows written in the
// same millisecond, which a fake Prisma would never reproduce.
const EVENT_TYPE_PREFIX = `notif-spec-${Date.now()}`;
const TOTAL_NOTIFICATIONS = 5;
const PAGE_SIZE = 2;
// Big enough to hold this spec's own rows in one page, whatever else the
// shared control plane already has in its inbox.
const PAGE_LIMIT_FOR_FULL_SCAN = 500;

function toPageRequest(cursor: string | null, limit: number = PAGE_SIZE): PageRequest {
	return { cursor: decodeCursor(cursor ?? undefined), limit };
}

describe('admin notification repository (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let repository: AdminNotificationRepository;
	let created: readonly AdminNotification[];

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		repository = moduleFixture.get(AdminNotificationRepository, { strict: false });

		// All five share one timestamp on purpose, so the walk has to rely on
		// the id tie-break rather than on distinct createdAt values.
		const sharedCreatedAt = new Date();
		const rows: AdminNotification[] = [];

		for (let index = 0; index < TOTAL_NOTIFICATIONS; index += 1) {
			rows.push(
				await prisma.adminNotification.create({
					data: {
						category: index === 0 ? 'traffic' : 'system',
						severity: 'info',
						eventType: `${EVENT_TYPE_PREFIX}-${index}`,
						payload: { index },
						createdAt: sharedCreatedAt,
					},
				}),
			);
		}

		created = rows;
	});

	afterAll(async () => {
		await prisma.adminNotification.deleteMany({ where: { eventType: { startsWith: EVENT_TYPE_PREFIX } } });
		await moduleFixture.close();
	});

	async function listOwnRows(page: PageRequest): Promise<{ items: readonly AdminNotification[]; nextCursor: string | null }> {
		const result = await repository.listPage({ read: 'all' }, page);

		return { items: result.items.filter((row) => row.eventType.startsWith(EVENT_TYPE_PREFIX)), nextCursor: result.nextCursor };
	}

	it('walks the whole inbox without repeating or skipping a row when several share a timestamp', async () => {
		const seenIds: string[] = [];
		let cursor: string | null = null;
		let pageCount = 0;

		do {
			const page = await repository.listPage({ read: 'all' }, toPageRequest(cursor));

			seenIds.push(...page.items.map((row) => row.id));
			cursor = page.nextCursor;
			pageCount += 1;
		} while (cursor !== null && pageCount < 50);

		const ownIds = seenIds.filter((id) => created.some((row) => row.id === id));

		expect(new Set(ownIds).size).toBe(ownIds.length);
		expect(ownIds).toHaveLength(TOTAL_NOTIFICATIONS);
	});

	it('returns at most the requested page size and a cursor while more remain', async () => {
		const page = await repository.listPage({ read: 'all' }, toPageRequest(null));

		expect(page.items).toHaveLength(PAGE_SIZE);
		expect(page.nextCursor).not.toBeNull();
	});

	it('returns a null cursor on the last page instead of an empty one', async () => {
		const totalCount = await prisma.adminNotification.count();

		const page = await repository.listPage({ read: 'all' }, toPageRequest(null, totalCount + 1));

		expect(page.nextCursor).toBeNull();
	});

	it('returns the newest first', async () => {
		const page = await repository.listPage({ read: 'all' }, toPageRequest(null, PAGE_LIMIT_FOR_FULL_SCAN));
		const timestamps = page.items.map((row) => row.createdAt.getTime());

		expect([...timestamps].sort((left, right) => right - left)).toEqual(timestamps);
	});

	describe('filters', () => {
		it('narrows to one category', async () => {
			const page = await repository.listPage({ read: 'all', category: 'traffic' }, toPageRequest(null, PAGE_LIMIT_FOR_FULL_SCAN));
			const own = page.items.filter((row) => row.eventType.startsWith(EVENT_TYPE_PREFIX));

			expect(own).toHaveLength(1);
			expect(own[0].category).toBe('traffic');
		});

		it('separates read from unread', async () => {
			await repository.markRead(created[0].id, true);

			const unread = await listOwnRows(toPageRequest(null, PAGE_LIMIT_FOR_FULL_SCAN));
			const readOnly = await repository.listPage({ read: 'read' }, toPageRequest(null, PAGE_LIMIT_FOR_FULL_SCAN));
			const unreadOnly = await repository.listPage({ read: 'unread' }, toPageRequest(null, PAGE_LIMIT_FOR_FULL_SCAN));

			expect(unread.items).toHaveLength(TOTAL_NOTIFICATIONS);
			expect(readOnly.items.map((row) => row.id)).toContain(created[0].id);
			expect(unreadOnly.items.map((row) => row.id)).not.toContain(created[0].id);

			await repository.markRead(created[0].id, false);
		});
	});

	describe('read state', () => {
		it('marks one as read and back as unread', async () => {
			await repository.markRead(created[1].id, true);
			const afterRead = await repository.findById(created[1].id);

			await repository.markRead(created[1].id, false);
			const afterUnread = await repository.findById(created[1].id);

			expect(afterRead?.readAt).not.toBeNull();
			expect(afterUnread?.readAt).toBeNull();
		});

		it('treats marking an already-read row as a no-op rather than an error', async () => {
			await repository.markRead(created[2].id, true);

			await expect(repository.markRead(created[2].id, true)).resolves.toBeUndefined();

			await repository.markRead(created[2].id, false);
		});

		it('ignores an id that does not exist instead of throwing', async () => {
			await expect(repository.markRead('00000000-0000-0000-0000-000000000000', true)).resolves.toBeUndefined();
		});

		it('counts the unread ones and drops the count as they are read', async () => {
			const before = await repository.countUnread();

			await repository.markRead(created[3].id, true);
			const after = await repository.countUnread();

			expect(after).toBe(before - 1);
			await repository.markRead(created[3].id, false);
		});

		// This one touches the whole inbox, so it puts back exactly the rows
		// it marked — a spec must not quietly read a developer's own
		// notifications for them.
		it('marks every unread row at once and reports how many it touched', async () => {
			const unreadBefore = await prisma.adminNotification.findMany({ where: { readAt: null }, select: { id: true } });

			const markedCount = await repository.markAllRead();

			expect(markedCount).toBe(unreadBefore.length);
			expect(await repository.countUnread()).toBe(0);

			await prisma.adminNotification.updateMany({ where: { id: { in: unreadBefore.map((row) => row.id) } }, data: { readAt: null } });
		});
	});

	it('returns null for an unknown id', async () => {
		expect(await repository.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
	});
});
