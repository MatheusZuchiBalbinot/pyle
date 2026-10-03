import { Injectable } from '@nestjs/common';
import type { LoadBalancingStrategy, Prisma, ScalingProfile } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { CREATED, DELETED, diffFields, type ConfigChangeDetail } from '../domain/config-change-detail.js';
import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_SERVICES } from '../domain/gateway-config-limits.js';
import { isUniqueViolation } from '../domain/unique-violation.js';
import { ServiceRepository, type ServiceWithInstances } from '../infrastructure/service.repository.js';
import { toServiceDto, type ServiceDto } from '../interface/dto/gateway-config-responses.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from './config-change-recorder.js';
import { InstanceRuntimeService } from './instance-runtime.service.js';

type ServiceSettingsInput = {
	readonly name?: string;
	readonly description?: string | null;
	readonly lbStrategy?: LoadBalancingStrategy;
	readonly timeoutMs?: number;
	readonly retryMaxAttempts?: number;
	readonly healthCheckPath?: string;
	readonly healthCheckIntervalMs?: number;
	readonly healthCheckTimeoutMs?: number;
	readonly healthyThreshold?: number;
	readonly unhealthyThreshold?: number;
	readonly circuitFailureThreshold?: number;
	readonly circuitCooldownMs?: number;
	// Null = scaled by hand only.
	readonly scalingProfile?: ScalingProfile | null;
};

type CreateServiceInput = ServiceSettingsInput & { readonly slug: string; readonly name: string };

type UpdateServiceInput = ServiceSettingsInput;

// The fields a change summary mentions, in the order the operator reads them.
const AUDITED_FIELDS = [
	'name',
	'description',
	'lbStrategy',
	'timeoutMs',
	'retryMaxAttempts',
	'healthCheckPath',
	'healthCheckIntervalMs',
	'healthCheckTimeoutMs',
	'healthyThreshold',
	'unhealthyThreshold',
	'circuitFailureThreshold',
	'circuitCooldownMs',
	'scalingProfile',
] as const satisfies readonly (keyof ServiceWithInstances)[];

type HealthCheckTiming = { readonly intervalMs: number; readonly timeoutMs: number };

// The schema defaults, for validating a create that leaves them out.
const DEFAULT_TIMING: HealthCheckTiming = { intervalMs: 5000, timeoutMs: 2000 };

@Injectable()
export class ServicesService {
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly services: ServiceRepository,
		private readonly recorder: ConfigChangeRecorder,
		private readonly runtime: InstanceRuntimeService,
	) {}

	async list(): Promise<readonly ServiceDto[]> {
		const services = await this.services.listActive();
		const instanceIds = services.flatMap((service) => service.instances.map((instance) => instance.id));
		const runtime = await this.runtime.load(instanceIds);

		return services.map((service) => toServiceDto(service, runtime));
	}

	async get(slug: string): Promise<ServiceDto> {
		const service = await this.findOrThrow(slug);
		const runtime = await this.runtime.load(service.instances.map((instance) => instance.id));

		return toServiceDto(service, runtime);
	}

	async create(input: CreateServiceInput, actor: ConfigActor): Promise<ServiceDto> {
		const existing = await this.services.findActiveBySlug(input.slug);

		if (existing) {
			throw new ConfigConflictError(`A service with slug "${input.slug}" already exists`);
		}

		const serviceCount = await this.services.countActive();

		if (serviceCount >= MAX_SERVICES) {
			throw new ConfigConflictError(`The gateway already has the maximum of ${MAX_SERVICES} services`);
		}

		const data: Prisma.ServiceCreateInput = { ...input };
		const timing: HealthCheckTiming = {
			intervalMs: data.healthCheckIntervalMs ?? DEFAULT_TIMING.intervalMs,
			timeoutMs: data.healthCheckTimeoutMs ?? DEFAULT_TIMING.timeoutMs,
		};

		assertHealthCheckTiming(timing);
		const created = await this.writeUnique(input.slug, async (transaction) => {
			const service = await this.services.create(data, transaction);

			await this.recorder.record(toServiceChange(service, 'created', CREATED), actor, transaction);

			return service;
		});

		await this.recorder.announce([toServiceChange(created, 'created', CREATED)]);

		return toServiceDto(created, await this.runtime.load([]));
	}

	async update(slug: string, input: UpdateServiceInput, actor: ConfigActor): Promise<ServiceDto> {
		const current = await this.findOrThrow(slug);
		const timing: HealthCheckTiming = {
			intervalMs: input.healthCheckIntervalMs ?? current.healthCheckIntervalMs,
			timeoutMs: input.healthCheckTimeoutMs ?? current.healthCheckTimeoutMs,
		};

		assertHealthCheckTiming(timing);
		assertScalingProfileChange(current, input);
		const updated = await this.prisma.transaction(async (transaction) => {
			const service = await this.services.update(current.id, { ...input }, transaction);
			const change = toServiceChange(service, 'updated', diffFields(current, service, AUDITED_FIELDS));

			await this.recorder.record(change, actor, transaction);

			return { service, change };
		});

		await this.recorder.announce([updated.change]);
		const runtime = await this.runtime.load(updated.service.instances.map((instance) => instance.id));

		return toServiceDto(updated.service, runtime);
	}

	// Refused while a route still uses it: the route would start answering 503.
	async delete(slug: string, actor: ConfigActor): Promise<void> {
		const service = await this.findOrThrow(slug);
		const hasActiveRoutes = service._count.routes > 0;

		if (hasActiveRoutes) {
			throw new ConfigConflictError(`Service "${slug}" still has ${service._count.routes} route(s); delete or repoint them first`);
		}

		const change = toServiceChange(service, 'deleted', DELETED);

		await this.prisma.transaction(async (transaction) => {
			await this.services.softDeleteWithInstances(service.id, transaction, new Date());
			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);
	}

	async findOrThrow(slug: string): Promise<ServiceWithInstances> {
		const service = await this.services.findActiveBySlug(slug);

		if (!service) {
			throw new ConfigNotFoundError(`No service with slug "${slug}"`);
		}

		return service;
	}

	// The partial unique index settles a race the check above can lose.
	private async writeUnique<R>(slug: string, work: (transaction: Prisma.TransactionClient) => Promise<R>): Promise<R> {
		try {
			return await this.prisma.transaction(work);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConfigConflictError(`A service with slug "${slug}" already exists`);
			}

			throw error;
		}
	}
}

// The profile says which image the managed instances run: changing it
// under running replicas would leave them on the old one.
function assertScalingProfileChange(current: ServiceWithInstances, input: ServiceSettingsInput): void {
	const isChangingProfile = input.scalingProfile !== undefined && input.scalingProfile !== current.scalingProfile;
	const hasManagedReplicas = current.desiredManagedReplicas > 0 || current.instances.some((instance) => instance.source === 'managed');

	if (!isChangingProfile || !hasManagedReplicas) {
		return;
	}

	throw new ConfigConflictError(`Service "${current.slug}" has managed replicas; scale it to 0 before changing its scaling profile`);
}

// A check that may run longer than its interval would overlap the next one.
function assertHealthCheckTiming(timing: HealthCheckTiming): void {
	if (timing.timeoutMs < timing.intervalMs) {
		return;
	}

	throw new ConfigValidationError('healthCheckTimeoutMs must be shorter than healthCheckIntervalMs');
}

function toServiceChange(
	service: { readonly id: string; readonly name: string },
	action: ConfigChange['action'],
	detail: ConfigChangeDetail,
): ConfigChange {
	return { entityType: 'service', entityId: service.id, entityName: service.name, action, detail };
}
