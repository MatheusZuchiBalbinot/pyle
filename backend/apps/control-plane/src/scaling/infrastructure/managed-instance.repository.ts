import { Injectable } from '@nestjs/common';
import type { Prisma, ScalingProfile, ServiceInstance } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ACTIVE, type PrismaExecutor } from '../../gateway-config/infrastructure/prisma-client.js';

export type ScalableService = {
	readonly id: string;
	readonly slug: string;
	readonly scalingProfile: ScalingProfile;
	readonly desiredManagedReplicas: number;
	readonly healthCheckPath: string;
};

const SCALABLE_SELECT = { id: true, slug: true, scalingProfile: true, desiredManagedReplicas: true, healthCheckPath: true } as const;
const MANAGED = { source: 'managed', ...ACTIVE } as const;

type ScalableRow = Omit<ScalableService, 'scalingProfile'> & { readonly scalingProfile: ScalingProfile | null };

@Injectable()
export class ManagedInstanceRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	async findScalable(serviceId: string): Promise<ScalableService | null> {
		const row = await this.prisma.service.findFirst({ where: { id: serviceId, ...ACTIVE }, select: SCALABLE_SELECT });

		return toScalable(row);
	}

	async listScalable(): Promise<readonly ScalableService[]> {
		const rows = await this.prisma.service.findMany({ where: { scalingProfile: { not: null }, ...ACTIVE }, select: SCALABLE_SELECT });

		return rows.flatMap((row) => toScalable(row) ?? []);
	}

	listManaged(serviceId: string): Promise<readonly ServiceInstance[]> {
		return this.prisma.serviceInstance.findMany({ where: { serviceId, ...MANAGED }, orderBy: { createdAt: 'asc' } });
	}

	listAllManaged(): Promise<readonly ServiceInstance[]> {
		return this.prisma.serviceInstance.findMany({ where: MANAGED });
	}

	async usedHostPorts(): Promise<ReadonlySet<number>> {
		const rows = await this.prisma.serviceInstance.findMany({ where: { hostPort: { not: null }, ...ACTIVE }, select: { hostPort: true } });

		return new Set(rows.flatMap((row) => (row.hostPort === null ? [] : [row.hostPort])));
	}

	async setDesired(serviceId: string, desiredManagedReplicas: number, executor: PrismaExecutor): Promise<void> {
		await executor.service.update({ where: { id: serviceId }, data: { desiredManagedReplicas } });
	}

	create(data: Prisma.ServiceInstanceUncheckedCreateInput, executor: PrismaExecutor): Promise<ServiceInstance> {
		return executor.serviceInstance.create({ data });
	}

	update(id: string, data: Prisma.ServiceInstanceUpdateInput, executor: PrismaExecutor): Promise<ServiceInstance> {
		return executor.serviceInstance.update({ where: { id }, data });
	}
}

function toScalable(row: ScalableRow | null): ScalableService | null {
	if (row === null || row.scalingProfile === null) {
		return null;
	}

	return { ...row, scalingProfile: row.scalingProfile };
}
