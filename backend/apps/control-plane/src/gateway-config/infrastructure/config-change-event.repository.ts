import { Injectable } from '@nestjs/common';
import type { ConfigChangeEvent, ConfigEntityType, Prisma } from '@prisma/control-plane-client';

import { toPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { PrismaExecutor } from './prisma-client.js';

const LIST_ORDER = [{ occurredAt: 'desc' }, { id: 'desc' }] as const;

export type ConfigActivityFilter = {
	readonly entityType?: ConfigEntityType;
	readonly entityId?: string;
};

// Append only.
@Injectable()
export class ConfigChangeEventRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	create(data: Prisma.ConfigChangeEventCreateInput, executor: PrismaExecutor = this.prisma): Promise<ConfigChangeEvent> {
		return executor.configChangeEvent.create({ data });
	}

	async listPage(filter: ConfigActivityFilter, page: PageRequest): Promise<Page<ConfigChangeEvent>> {
		const rows = await this.prisma.configChangeEvent.findMany({
			where: { entityType: filter.entityType, entityId: filter.entityId, ...toCursorFilter(page) },
			orderBy: [...LIST_ORDER],
			take: page.limit + 1,
		});

		return toPage(rows, page.limit, (row) => ({ orderedAt: row.occurredAt, id: row.id }));
	}

	listSince(since: Date, limit: number): Promise<readonly ConfigChangeEvent[]> {
		return this.prisma.configChangeEvent.findMany({ where: { occurredAt: { gte: since } }, orderBy: [...LIST_ORDER], take: limit });
	}
}

function toCursorFilter(page: PageRequest): Prisma.ConfigChangeEventWhereInput {
	if (!page.cursor) {
		return {};
	}

	return { OR: [{ occurredAt: { lt: page.cursor.orderedAt } }, { occurredAt: page.cursor.orderedAt, id: { lt: page.cursor.id } }] };
}
