import { Injectable } from '@nestjs/common';
import type { Prisma, Route, Service } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ACTIVE, type PrismaExecutor } from './prisma-client.js';

const WITH_SERVICE = { service: true } as const satisfies Prisma.RouteInclude;

export type RouteWithService = Route & { readonly service: Service };

@Injectable()
export class RouteRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	listActive(): Promise<readonly RouteWithService[]> {
		return this.prisma.route.findMany({ where: ACTIVE, orderBy: { pathPrefix: 'asc' }, include: WITH_SERVICE });
	}

	findActiveById(id: string, executor: PrismaExecutor = this.prisma): Promise<RouteWithService | null> {
		return executor.route.findFirst({ where: { id, ...ACTIVE }, include: WITH_SERVICE });
	}

	findActiveByPrefix(pathPrefix: string, executor: PrismaExecutor = this.prisma): Promise<Route | null> {
		return executor.route.findFirst({ where: { pathPrefix, ...ACTIVE } });
	}

	findByIdIncludingDeleted(id: string): Promise<Route | null> {
		return this.prisma.route.findUnique({ where: { id } });
	}

	countActiveIn(ids: readonly string[], executor: PrismaExecutor = this.prisma): Promise<number> {
		return executor.route.count({ where: { id: { in: [...ids] }, ...ACTIVE } });
	}

	countActive(): Promise<number> {
		return this.prisma.route.count({ where: ACTIVE });
	}

	create(data: Prisma.RouteUncheckedCreateInput, executor: PrismaExecutor = this.prisma): Promise<RouteWithService> {
		return executor.route.create({ data, include: WITH_SERVICE });
	}

	update(id: string, data: Prisma.RouteUncheckedUpdateInput, executor: PrismaExecutor = this.prisma): Promise<RouteWithService> {
		return executor.route.update({ where: { id }, data, include: WITH_SERVICE });
	}

	// Its access rows go with it, or a consumer would keep a grant to a deleted route.
	async softDelete(id: string, deletedAt: Date, executor: PrismaExecutor): Promise<void> {
		await executor.consumerRouteAccess.deleteMany({ where: { routeId: id } });
		await executor.route.update({ where: { id }, data: { deletedAt } });
	}
}
