import { Injectable } from '@nestjs/common';
import type { SystemHealthComponent, SystemHealthEvent, SystemHealthStatus } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

const DEFAULT_RECENT_LIMIT = 50;

type RecordSystemHealthEventInput = {
	readonly component: SystemHealthComponent;
	readonly status: SystemHealthStatus;
	readonly detail: string | null;
};

@Injectable()
export class SystemHealthEventRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	record(input: RecordSystemHealthEventInput): Promise<SystemHealthEvent> {
		return this.prisma.systemHealthEvent.create({ data: input });
	}

	listRecent(limit: number = DEFAULT_RECENT_LIMIT): Promise<readonly SystemHealthEvent[]> {
		return this.prisma.systemHealthEvent.findMany({
			orderBy: { occurredAt: 'desc' },
			take: limit,
		});
	}
}
