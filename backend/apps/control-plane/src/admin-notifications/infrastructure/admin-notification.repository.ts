import { Injectable } from '@nestjs/common';
import type { AdminNotification, AdminNotificationCategory, AdminNotificationSeverity, AlertSubjectType, Prisma } from '@prisma/control-plane-client';

import { toPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

export type CreateAdminNotificationInput = {
	readonly category: AdminNotificationCategory;
	readonly severity: AdminNotificationSeverity;
	readonly eventType: string;
	readonly subjectType: AlertSubjectType | null;
	readonly subjectId: string | null;
	readonly payload: Prisma.InputJsonValue;
};

export type NotificationReadFilter = 'unread' | 'read' | 'all';

export type ListAdminNotificationsFilter = {
	readonly category?: AdminNotificationCategory;
	readonly read: NotificationReadFilter;
};

const LIST_ORDER = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

// Rows are never deleted by the app; only readAt changes.
@Injectable()
export class AdminNotificationRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	create(input: CreateAdminNotificationInput): Promise<AdminNotification> {
		return this.prisma.adminNotification.create({ data: input });
	}

	// Keyset on (createdAt, id), newest first.
	async listPage(filter: ListAdminNotificationsFilter, page: PageRequest): Promise<Page<AdminNotification>> {
		const rows = await this.prisma.adminNotification.findMany({
			where: { category: filter.category, ...toReadWhere(filter.read), ...toCursorFilter(page) },
			orderBy: [...LIST_ORDER],
			take: page.limit + 1,
		});

		return toPage(rows, page.limit, (row) => ({ orderedAt: row.createdAt, id: row.id }));
	}

	countUnread(): Promise<number> {
		return this.prisma.adminNotification.count({ where: { readAt: null } });
	}

	findById(id: string): Promise<AdminNotification | null> {
		return this.prisma.adminNotification.findUnique({ where: { id } });
	}

	// updateMany so marking an already-read row is a no-op, not an error.
	async markRead(id: string, isRead: boolean): Promise<void> {
		await this.prisma.adminNotification.updateMany({ where: { id }, data: { readAt: isRead ? new Date() : null } });
	}

	async markAllRead(): Promise<number> {
		const result = await this.prisma.adminNotification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });

		return result.count;
	}
}

function toCursorFilter(page: PageRequest): Prisma.AdminNotificationWhereInput {
	if (!page.cursor) {
		return {};
	}

	return { OR: [{ createdAt: { lt: page.cursor.orderedAt } }, { createdAt: page.cursor.orderedAt, id: { lt: page.cursor.id } }] };
}

function toReadWhere(read: NotificationReadFilter): Prisma.AdminNotificationWhereInput {
	if (read === 'unread') {
		return { readAt: null };
	}

	if (read === 'read') {
		return { readAt: { not: null } };
	}

	return {};
}
