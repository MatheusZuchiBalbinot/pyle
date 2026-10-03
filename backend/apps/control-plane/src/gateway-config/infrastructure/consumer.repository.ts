import { Injectable } from '@nestjs/common';
import type { ApiKey, Consumer, Prisma, Route } from '@prisma/control-plane-client';

import { toPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ACTIVE, type PrismaExecutor } from './prisma-client.js';

const WITH_KEYS_AND_ROUTES = {
	apiKeys: { orderBy: { createdAt: 'desc' } },
	routeAccess: { where: { route: ACTIVE }, include: { route: true }, orderBy: { route: { pathPrefix: 'asc' } } },
} as const satisfies Prisma.ConsumerInclude;

const LIST_ORDER = [{ createdAt: 'desc' }, { id: 'desc' }] as const;

export type ConsumerWithKeysAndRoutes = Consumer & {
	readonly apiKeys: readonly ApiKey[];
	readonly routeAccess: readonly { readonly route: Route }[];
};

@Injectable()
export class ConsumerRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	async listPage(page: PageRequest): Promise<Page<ConsumerWithKeysAndRoutes>> {
		const rows = await this.prisma.consumer.findMany({
			where: { ...ACTIVE, ...toCursorFilter(page) },
			orderBy: [...LIST_ORDER],
			take: page.limit + 1,
			include: WITH_KEYS_AND_ROUTES,
		});

		return toPage(rows, page.limit, (row) => ({ orderedAt: row.createdAt, id: row.id }));
	}

	findActiveBySlug(slug: string, executor: PrismaExecutor = this.prisma): Promise<ConsumerWithKeysAndRoutes | null> {
		return executor.consumer.findFirst({ where: { slug, ...ACTIVE }, include: WITH_KEYS_AND_ROUTES });
	}

	findByIdIncludingDeleted(id: string): Promise<Consumer | null> {
		return this.prisma.consumer.findUnique({ where: { id } });
	}

	create(data: Prisma.ConsumerCreateInput, executor: PrismaExecutor = this.prisma): Promise<Consumer> {
		return executor.consumer.create({ data });
	}

	update(id: string, data: Prisma.ConsumerUpdateInput, executor: PrismaExecutor = this.prisma): Promise<Consumer> {
		return executor.consumer.update({ where: { id }, data });
	}

	async softDelete(id: string, deletedAt: Date, executor: PrismaExecutor): Promise<void> {
		await executor.consumer.update({ where: { id }, data: { deletedAt } });
	}

	// Replaces the whole grant set: empty means every route.
	async replaceRouteAccess(consumerId: string, routeIds: readonly string[], executor: PrismaExecutor): Promise<void> {
		await executor.consumerRouteAccess.deleteMany({ where: { consumerId } });

		if (routeIds.length === 0) {
			return;
		}

		await executor.consumerRouteAccess.createMany({ data: routeIds.map((routeId) => ({ consumerId, routeId })) });
	}

	listDeletedBefore(cutoff: Date): Promise<readonly Consumer[]> {
		return this.prisma.consumer.findMany({ where: { deletedAt: { not: null, lt: cutoff } } });
	}

	// Traffic samples keep the consumer id on purpose: the history still adds up.
	async purge(id: string): Promise<void> {
		await this.prisma.transaction(async (transaction) => {
			await transaction.consumerRouteAccess.deleteMany({ where: { consumerId: id } });
			await transaction.apiKey.deleteMany({ where: { consumerId: id } });
			await transaction.consumer.delete({ where: { id } });
		});
	}
}

function toCursorFilter(page: PageRequest): Prisma.ConsumerWhereInput {
	if (!page.cursor) {
		return {};
	}

	return { OR: [{ createdAt: { lt: page.cursor.orderedAt } }, { createdAt: page.cursor.orderedAt, id: { lt: page.cursor.id } }] };
}
