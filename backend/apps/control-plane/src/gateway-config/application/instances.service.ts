import { Injectable } from '@nestjs/common';
import type { Prisma, ServiceInstance } from '@prisma/control-plane-client';

import { InvalidUpstreamUrlError, parseUpstreamUrl } from '@pyle/shared/contracts/upstream-url.js';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { CREATED, DELETED, diffFields, type ConfigChangeDetail } from '../domain/config-change-detail.js';
import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_INSTANCES_PER_SERVICE } from '../domain/gateway-config-limits.js';
import { isUniqueViolation } from '../domain/unique-violation.js';
import { InstanceRepository } from '../infrastructure/instance.repository.js';
import type { ServiceWithInstances } from '../infrastructure/service.repository.js';
import { toInstanceDto, type InstanceDto } from '../interface/dto/gateway-config-responses.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from './config-change-recorder.js';
import { InstanceRuntimeService } from './instance-runtime.service.js';
import { ServicesService } from './services.service.js';

type CreateInstanceInput = {
	readonly name: string;
	readonly url: string;
	readonly weight?: number;
	readonly isEnabled?: boolean;
};

type UpdateInstanceInput = Partial<CreateInstanceInput>;

// Allowed (an operator may want to drain everything), but worth saying.
type InstanceWarning = 'service-has-no-enabled-instance';

type UpdateInstanceResult = {
	readonly instance: InstanceDto;
	readonly warning: InstanceWarning | null;
};

const AUDITED_FIELDS = ['name', 'url', 'weight', 'isEnabled'] as const satisfies readonly (keyof ServiceInstance)[];

@Injectable()
export class InstancesService {
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly services: ServicesService,
		private readonly instances: InstanceRepository,
		private readonly recorder: ConfigChangeRecorder,
		private readonly runtime: InstanceRuntimeService,
	) {}

	async create(serviceSlug: string, input: CreateInstanceInput, actor: ConfigActor): Promise<InstanceDto> {
		const service = await this.services.findOrThrow(serviceSlug);

		await this.assertNameFree(service, input.name);

		if (service.instances.length >= MAX_INSTANCES_PER_SERVICE) {
			throw new ConfigConflictError(`Service "${serviceSlug}" already has the maximum of ${MAX_INSTANCES_PER_SERVICE} instances`);
		}

		const data: Prisma.ServiceInstanceUncheckedCreateInput = { ...input, url: normalizeUrl(input.url), serviceId: service.id, source: 'static' };
		const created = await this.writeUnique(input.name, async (transaction) => {
			const instance = await this.instances.create(data, transaction);

			await this.recorder.record(toInstanceChange(instance, 'created', CREATED), actor, transaction);

			return instance;
		});

		await this.recorder.announce([toInstanceChange(created, 'created', CREATED)]);

		return toInstanceDto(created, await this.runtime.load([created.id]));
	}

	async update(serviceSlug: string, instanceId: string, input: UpdateInstanceInput, actor: ConfigActor): Promise<UpdateInstanceResult> {
		const service = await this.services.findOrThrow(serviceSlug);
		const current = await this.findOrThrow(service, instanceId);

		assertStatic(current);
		const isRenaming = input.name !== undefined && input.name !== current.name;

		if (isRenaming) {
			await this.assertNameFree(service, input.name ?? current.name);
		}

		const data: Prisma.ServiceInstanceUpdateInput = { ...input, url: input.url === undefined ? undefined : normalizeUrl(input.url) };
		const updated = await this.writeUnique(input.name ?? current.name, async (transaction) => {
			const instance = await this.instances.update(current.id, data, transaction);
			const change = toInstanceChange(instance, 'updated', diffFields(current, instance, AUDITED_FIELDS));

			await this.recorder.record(change, actor, transaction);
			const enabledCount = await this.instances.countEnabled(service.id, transaction);

			return { instance, change, enabledCount };
		});

		await this.recorder.announce([updated.change]);
		const hasRouteButNoEnabledInstance = service._count.routes > 0 && updated.enabledCount === 0;
		const warning: InstanceWarning | null = hasRouteButNoEnabledInstance ? 'service-has-no-enabled-instance' : null;
		const instance = toInstanceDto(updated.instance, await this.runtime.load([updated.instance.id]));

		return { instance, warning };
	}

	// The last instance of a routed service cannot be removed; draining it is reversible.
	async delete(serviceSlug: string, instanceId: string, actor: ConfigActor): Promise<void> {
		const service = await this.services.findOrThrow(serviceSlug);
		const instance = await this.findOrThrow(service, instanceId);

		assertStatic(instance);
		const isLastInstanceOfRoutedService = service._count.routes > 0 && service.instances.length === 1;

		if (isLastInstanceOfRoutedService) {
			throw new ConfigConflictError(`"${instance.name}" is the last instance of "${serviceSlug}", which routes still use; drain it instead`);
		}

		const change = toInstanceChange(instance, 'deleted', DELETED);

		await this.prisma.transaction(async (transaction) => {
			await this.instances.softDelete(instance.id, new Date(), transaction);
			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);
	}

	async findOrThrow(service: ServiceWithInstances, instanceId: string): Promise<ServiceInstance> {
		const instance = await this.instances.findActive(service.id, instanceId);

		if (!instance) {
			throw new ConfigNotFoundError(`No instance "${instanceId}" in service "${service.slug}"`);
		}

		return instance;
	}

	private async assertNameFree(service: ServiceWithInstances, name: string): Promise<void> {
		const existing = await this.instances.findActiveByName(service.id, name);

		if (existing) {
			throw new ConfigConflictError(`Service "${service.slug}" already has an instance named "${name}"`);
		}
	}

	private async writeUnique<R>(name: string, work: (transaction: Prisma.TransactionClient) => Promise<R>): Promise<R> {
		try {
			return await this.prisma.transaction(work);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConfigConflictError(`An instance named "${name}" already exists in this service`);
			}

			throw error;
		}
	}
}

export function toInstanceChange(
	instance: { readonly id: string; readonly name: string },
	action: ConfigChange['action'],
	detail: ConfigChangeDetail,
): ConfigChange {
	return { entityType: 'instance', entityId: instance.id, entityName: instance.name, action, detail };
}

function normalizeUrl(raw: string): string {
	try {
		return parseUpstreamUrl(raw);
	} catch (error) {
		if (error instanceof InvalidUpstreamUrlError) {
			throw new ConfigValidationError(error.message);
		}

		throw error;
	}
}

// Managed instances belong to scaling: editing one by hand would fight the reconciler.
function assertStatic(instance: ServiceInstance): void {
	if (instance.source === 'static') {
		return;
	}

	throw new ConfigConflictError(`Instance "${instance.name}" is managed by scaling; change the replica count instead`);
}
