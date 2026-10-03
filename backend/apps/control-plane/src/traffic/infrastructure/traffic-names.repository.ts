import { Injectable } from '@nestjs/common';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

export type RouteName = { readonly id: string; readonly name: string; readonly pathPrefix: string };
export type InstanceName = { readonly id: string; readonly name: string; readonly serviceId: string; readonly serviceSlug: string };
export type ServiceName = { readonly id: string; readonly slug: string; readonly name: string };
type ConsumerName = { readonly id: string; readonly slug: string; readonly name: string };

// Soft-deleted rows included: a removed route's traffic still reads as that route.
@Injectable()
export class TrafficNamesRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	async routes(ids: readonly string[]): Promise<ReadonlyMap<string, RouteName>> {
		if (ids.length === 0) {
			return new Map();
		}

		const rows = await this.prisma.route.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true, pathPrefix: true } });

		return new Map(rows.map((row) => [row.id, row]));
	}

	async consumers(ids: readonly string[]): Promise<ReadonlyMap<string, ConsumerName>> {
		if (ids.length === 0) {
			return new Map();
		}

		const rows = await this.prisma.consumer.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true, name: true } });

		return new Map(rows.map((row) => [row.id, row]));
	}

	async instances(ids: readonly string[]): Promise<ReadonlyMap<string, InstanceName>> {
		if (ids.length === 0) {
			return new Map();
		}

		const rows = await this.prisma.serviceInstance.findMany({
			where: { id: { in: [...ids] } },
			select: { id: true, name: true, serviceId: true, service: { select: { slug: true } } },
		});

		return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name, serviceId: row.serviceId, serviceSlug: row.service.slug }]));
	}

	async services(ids: readonly string[]): Promise<ReadonlyMap<string, ServiceName>> {
		if (ids.length === 0) {
			return new Map();
		}

		const rows = await this.prisma.service.findMany({ where: { id: { in: [...ids] } }, select: { id: true, slug: true, name: true } });

		return new Map(rows.map((row) => [row.id, row]));
	}

	// Every instance the service ever had: its history includes removed ones.
	async instanceIdsOfService(serviceId: string): Promise<readonly string[]> {
		const rows = await this.prisma.serviceInstance.findMany({ where: { serviceId }, select: { id: true } });

		return rows.map((row) => row.id);
	}
}

// How an instance is named where its service is not obvious (alerts).
export function instanceDisplayName(instance: InstanceName): string {
	return `${instance.serviceSlug}/${instance.name}`;
}
