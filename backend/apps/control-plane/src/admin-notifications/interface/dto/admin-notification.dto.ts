import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import type { AdminNotification, AdminNotificationCategory, AdminNotificationSeverity } from '@prisma/control-plane-client';

import type { RealtimeEvent } from '../../../realtime/domain/realtime-event.js';

// A discriminated union the Swagger plugin cannot express: described, not typed.
const REALTIME_EVENT_SCHEMA: ApiPropertyOptions = {
	description:
		'The realtime event envelope, discriminated by `type` (config.changed, alert.triggered, alert.resolved, instance.state.changed, ...); every variant carries occurredAt',
	type: 'object',
	additionalProperties: true,
};

export class AdminNotificationDto {
	readonly id!: string;
	readonly category!: AdminNotificationCategory;
	readonly severity!: AdminNotificationSeverity;
	// Verbatim, so the console renders the same copy as the live toast.
	@ApiProperty(REALTIME_EVENT_SCHEMA)
	readonly event!: RealtimeEvent;
	readonly isRead!: boolean;
	readonly readAt!: string | null;
	readonly createdAt!: string;
}

export class AdminNotificationsPageDto {
	@ApiProperty({ type: [AdminNotificationDto] })
	readonly items!: readonly AdminNotificationDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
	// The whole inbox's unread total, not this page's.
	readonly unreadCount!: number;
}

export function toAdminNotificationDto(row: AdminNotification): AdminNotificationDto | null {
	if (!isRealtimeEventEnvelope(row.payload)) {
		return null;
	}

	return {
		id: row.id,
		category: row.category,
		severity: row.severity,
		event: row.payload,
		isRead: row.readAt !== null,
		readAt: row.readAt?.toISOString() ?? null,
		createdAt: row.createdAt.toISOString(),
	};
}

// Checked, not cast: an older row or the seeder may not carry the envelope.
function isRealtimeEventEnvelope(payload: unknown): payload is RealtimeEvent {
	if (typeof payload !== 'object' || payload === null) {
		return false;
	}

	const candidate = payload as { readonly type?: unknown; readonly occurredAt?: unknown };

	return typeof candidate.type === 'string' && typeof candidate.occurredAt === 'string';
}
