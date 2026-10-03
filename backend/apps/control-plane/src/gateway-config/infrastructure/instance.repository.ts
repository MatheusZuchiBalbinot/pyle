import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceInstance } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ACTIVE, type PrismaExecutor } from './prisma-client.js';

@Injectable()
export class InstanceRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	findActive(serviceId: string, instanceId: string, executor: PrismaExecutor = this.prisma): Promise<ServiceInstance | null> {
		return executor.serviceInstance.findFirst({ where: { id: instanceId, serviceId, ...ACTIVE } });
	}

	findActiveByName(serviceId: string, name: string, executor: PrismaExecutor = this.prisma): Promise<ServiceInstance | null> {
		return executor.serviceInstance.findFirst({ where: { serviceId, name, ...ACTIVE } });
	}

	findByIdIncludingDeleted(id: string): Promise<ServiceInstance | null> {
		return this.prisma.serviceInstance.findUnique({ where: { id } });
	}

	countActive(serviceId: string, executor: PrismaExecutor = this.prisma): Promise<number> {
		return executor.serviceInstance.count({ where: { serviceId, ...ACTIVE } });
	}

	countEnabled(serviceId: string, executor: PrismaExecutor = this.prisma): Promise<number> {
		return executor.serviceInstance.count({ where: { serviceId, isEnabled: true, ...ACTIVE } });
	}

	create(data: Prisma.ServiceInstanceUncheckedCreateInput, executor: PrismaExecutor = this.prisma): Promise<ServiceInstance> {
		return executor.serviceInstance.create({ data });
	}

	update(id: string, data: Prisma.ServiceInstanceUpdateInput, executor: PrismaExecutor = this.prisma): Promise<ServiceInstance> {
		return executor.serviceInstance.update({ where: { id }, data });
	}

	async softDelete(id: string, deletedAt: Date, executor: PrismaExecutor = this.prisma): Promise<void> {
		await executor.serviceInstance.update({ where: { id }, data: { deletedAt } });
	}
}
