import { Injectable } from '@nestjs/common';
import type { Prisma, Service, ServiceInstance } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ACTIVE, type PrismaExecutor } from './prisma-client.js';

const INSTANCE_ORDER = { name: 'asc' } as const;

const WITH_INSTANCES_AND_ROUTE_COUNT = {
	instances: { where: ACTIVE, orderBy: INSTANCE_ORDER },
	_count: { select: { routes: { where: ACTIVE } } },
} as const satisfies Prisma.ServiceInclude;

export type ServiceWithInstances = Service & {
	readonly instances: readonly ServiceInstance[];
	readonly _count: { readonly routes: number };
};

// Every read hides soft-deleted rows unless its name says otherwise.
@Injectable()
export class ServiceRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	listActive(): Promise<readonly ServiceWithInstances[]> {
		return this.prisma.service.findMany({ where: ACTIVE, orderBy: { name: 'asc' }, include: WITH_INSTANCES_AND_ROUTE_COUNT });
	}

	findActiveBySlug(slug: string, executor: PrismaExecutor = this.prisma): Promise<ServiceWithInstances | null> {
		return executor.service.findFirst({ where: { slug, ...ACTIVE }, include: WITH_INSTANCES_AND_ROUTE_COUNT });
	}

	findByIdIncludingDeleted(id: string): Promise<Service | null> {
		return this.prisma.service.findUnique({ where: { id } });
	}

	countActive(): Promise<number> {
		return this.prisma.service.count({ where: ACTIVE });
	}

	create(data: Prisma.ServiceCreateInput, executor: PrismaExecutor = this.prisma): Promise<ServiceWithInstances> {
		return executor.service.create({ data, include: WITH_INSTANCES_AND_ROUTE_COUNT });
	}

	update(id: string, data: Prisma.ServiceUpdateInput, executor: PrismaExecutor = this.prisma): Promise<ServiceWithInstances> {
		return executor.service.update({ where: { id }, data, include: WITH_INSTANCES_AND_ROUTE_COUNT });
	}

	// An instance of a deleted service must never be routed to.
	async softDeleteWithInstances(id: string, executor: PrismaExecutor, deletedAt: Date): Promise<void> {
		await executor.serviceInstance.updateMany({ where: { serviceId: id, ...ACTIVE }, data: { deletedAt } });
		await executor.service.update({ where: { id }, data: { deletedAt } });
	}
}
