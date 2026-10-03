import type { SystemHealthEvent } from '@prisma/control-plane-client';

export class SystemHealthEventDto {
	readonly component!: SystemHealthEvent['component'];
	readonly status!: SystemHealthEvent['status'];
	readonly detail!: string | null;
	readonly occurredAt!: string;
}

export function toSystemHealthEventDto(event: SystemHealthEvent): SystemHealthEventDto {
	return {
		component: event.component,
		status: event.status,
		detail: event.detail,
		occurredAt: event.occurredAt.toISOString(),
	};
}
