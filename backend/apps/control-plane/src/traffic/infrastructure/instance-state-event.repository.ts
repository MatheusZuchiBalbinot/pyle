import { Injectable } from '@nestjs/common';
import type { InstanceStateEvent } from '@prisma/control-plane-client';

import type { InstanceStateKindName, InstanceStateName } from '@pyle/shared/contracts/names.js';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

type RecordInstanceStateEvent = {
	readonly instanceId: string;
	readonly gatewayId: string;
	readonly kind: InstanceStateKindName;
	readonly fromState: InstanceStateName;
	readonly toState: InstanceStateName;
	readonly reason: string;
	readonly occurredAt: Date;
};

@Injectable()
export class InstanceStateEventRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	record(event: RecordInstanceStateEvent): Promise<InstanceStateEvent> {
		return this.prisma.instanceStateEvent.create({ data: event });
	}

	// Newest first; limited to some instances when given.
	listSince(since: Date, instanceIds: readonly string[] | null, limit: number): Promise<readonly InstanceStateEvent[]> {
		const where = instanceIds === null ? { occurredAt: { gte: since } } : { occurredAt: { gte: since }, instanceId: { in: [...instanceIds] } };

		return this.prisma.instanceStateEvent.findMany({ where, orderBy: { occurredAt: 'desc' }, take: limit });
	}
}
