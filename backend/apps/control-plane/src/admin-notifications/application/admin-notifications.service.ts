import { Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { AdminNotification, Prisma } from '@prisma/control-plane-client';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { type PageRequest } from '../../common/pagination.js';
import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { RealtimeEvent } from '../../realtime/domain/realtime-event.js';
import { classifyNotification } from '../domain/classify-notification.js';
import {
	AdminNotificationRepository,
	type CreateAdminNotificationInput,
	type ListAdminNotificationsFilter,
} from '../infrastructure/admin-notification.repository.js';
import { toAdminNotificationDto, type AdminNotificationDto, type AdminNotificationsPageDto } from '../interface/dto/admin-notification.dto.js';

// Records before the broker publishes (the publisher awaits its listeners), so a console
// refetching on the event finds the row.
@Injectable()
export class AdminNotificationsService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(AdminNotificationsService.name);
	private unsubscribe: (() => void) | null = null;

	constructor(
		private readonly repository: AdminNotificationRepository,
		private readonly realtimePublisher: RealtimePublisherService,
	) {}

	onModuleInit(): void {
		this.unsubscribe = this.realtimePublisher.onAdminEvent((event) => this.record(event));
	}

	onModuleDestroy(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
	}

	// unreadCount covers the whole inbox, not this page: it drives the bell badge.
	async list(filter: Partial<ListAdminNotificationsFilter>, page: PageRequest): Promise<AdminNotificationsPageDto> {
		const [rows, unreadCount] = await Promise.all([
			this.repository.listPage({ category: filter.category, read: filter.read ?? 'all' }, page),
			this.repository.countUnread(),
		]);
		const items = rows.items.flatMap((row) => this.toDtoOrDrop(row));

		return { items, nextCursor: rows.nextCursor, unreadCount };
	}

	private toDtoOrDrop(row: AdminNotification): readonly AdminNotificationDto[] {
		const dto = toAdminNotificationDto(row);

		if (dto) {
			return [dto];
		}

		this.logger.warn(`Dropping notification ${row.id}: its payload is not a realtime event`);

		return [];
	}

	async setRead(id: string, isRead: boolean): Promise<void> {
		const row = await this.repository.findById(id);

		if (!row) {
			throw new NotFoundException(`Notification "${id}" not found`);
		}

		await this.repository.markRead(id, isRead);
	}

	markAllRead(): Promise<number> {
		return this.repository.markAllRead();
	}

	// Best-effort: an inbox write failing must never block the event.
	private async record(event: RealtimeEvent): Promise<void> {
		const classification = classifyNotification(event);

		if (!classification) {
			return;
		}

		try {
			const notification: CreateAdminNotificationInput = {
				category: classification.category,
				severity: classification.severity,
				eventType: event.type,
				subjectType: classification.subject?.type ?? null,
				subjectId: classification.subject?.id ?? null,
				payload: event as unknown as Prisma.InputJsonValue,
			};

			await this.repository.create(notification);
		} catch (error) {
			this.logger.warn(`Could not persist notification for ${event.type}: ${toErrorMessage(error)}`);
		}
	}
}
