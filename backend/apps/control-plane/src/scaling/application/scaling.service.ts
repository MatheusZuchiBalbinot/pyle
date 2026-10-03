import { randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma, ServiceInstance } from '@prisma/control-plane-client';

import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getScalingConfig } from '../../config/scaling.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from '../../gateway-config/application/config-change-recorder.js';
import { toInstanceChange } from '../../gateway-config/application/instances.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { CREATED, DELETED, type ConfigChangeDetail } from '../../gateway-config/domain/config-change-detail.js';
import { ConfigConflictError } from '../../gateway-config/domain/config-errors.js';
import type { ServiceDto } from '../../gateway-config/interface/dto/gateway-config-responses.js';
import { pickFreePort } from '../domain/pick-free-port.js';
import { planScaling, type ScalingAction } from '../domain/plan-scaling.js';
import { MANAGED_PORT_RANGE, PROVISION_HEALTH_TIMEOUT_MS, SCALE_DOWN_DRAIN_MS } from '../domain/scaling-limits.js';
import { DEMO_SERVICE_NAME_BY_PROFILE } from '../domain/scaling-profiles.js';
import { ManagedInstanceRepository, type ScalableService } from '../infrastructure/managed-instance.repository.js';
import { ContainerDriver, InstanceHealthProbe } from './scaling-ports.js';

// Changes scaling makes on its own (convergence, reconciliation).
const SCALING_ACTOR: ConfigActor = { email: null };
const SHORT_ID_BYTES = 3;
const DOCKER_UNREACHABLE_MESSAGE =
	'The control plane cannot reach Docker (is the socket mounted, and DOCKER_GID its group?); no replica can be started';

// Every run goes through one queue, so requests and the reconciler never interleave writes.
@Injectable()
export class ScalingService {
	private readonly logger = new Logger(ScalingService.name);
	private tail: Promise<void> = Promise.resolve();

	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly managed: ManagedInstanceRepository,
		private readonly services: ServicesService,
		private readonly recorder: ConfigChangeRecorder,
		private readonly driver: ContainerDriver,
		private readonly probe: InstanceHealthProbe,
	) {}

	// Returns right away; containers follow in the background.
	async setReplicas(slug: string, managedReplicas: number, actor: ConfigActor): Promise<ServiceDto> {
		if (!getScalingConfig().isAllowed) {
			throw new ConfigConflictError('Scaling is not enabled on this control plane (SCALING_ALLOWED)');
		}

		const service = await this.services.findOrThrow(slug);

		if (service.scalingProfile === null) {
			throw new ConfigConflictError(`Service "${slug}" has no scaling profile: its instances are managed by hand`);
		}

		// Said now rather than as a failure the operator only finds in the logs.
		const isDockerReachable = await this.driver.isReachable();

		if (!isDockerReachable) {
			throw new ConfigConflictError(DOCKER_UNREACHABLE_MESSAGE);
		}

		const isChange = managedReplicas !== service.desiredManagedReplicas;

		if (isChange) {
			const detail: ConfigChangeDetail = { kind: 'managed_replicas', from: service.desiredManagedReplicas, to: managedReplicas };
			const change: ConfigChange = { entityType: 'service', entityId: service.id, entityName: service.name, action: 'updated', detail };

			await this.prisma.transaction(async (transaction) => {
				await this.managed.setDesired(service.id, managedReplicas, transaction);
				await this.recorder.record(change, actor, transaction);
			});
			await this.recorder.announce([change]);
		}

		void this.runExclusive(() => this.converge(service.id));

		return this.services.get(slug);
	}

	// Failures are logged, not thrown: nobody is waiting, and the next run retries.
	runExclusive(work: () => Promise<void>): Promise<void> {
		const run = this.tail.then(work).catch((error: unknown) => this.logger.error(`Scaling run failed: ${toErrorMessage(error)}`));

		this.tail = run;

		return run;
	}

	// Only inside runExclusive.
	async converge(serviceId: string): Promise<void> {
		const service = await this.managed.findScalable(serviceId);

		if (service === null) {
			return;
		}

		const instances = await this.managed.listManaged(serviceId);
		const actions = planScaling({ desired: service.desiredManagedReplicas, instances });
		const byId = new Map(instances.map((instance) => [instance.id, instance]));

		for (const action of actions) {
			await this.apply(service, action, byId);
		}
	}

	// Only inside runExclusive.
	async discard(instance: ServiceInstance, reason: string): Promise<void> {
		this.logger.warn(`Discarding managed instance ${instance.name} (${instance.id}): ${reason}`);
		await this.removeContainer(instance);
		const data: Prisma.ServiceInstanceUpdateInput = { isEnabled: false, scalingState: 'failed', deletedAt: new Date() };

		await this.write(
			(transaction) => this.managed.update(instance.id, data, transaction),
			(updated) => toInstanceChange(updated, 'deleted', { kind: 'replica_failed', reason }),
		);
	}

	private async apply(service: ScalableService, action: ScalingAction, byId: ReadonlyMap<string, ServiceInstance>): Promise<void> {
		switch (action.kind) {
			case 'create':
				return this.create(service);

			case 'remove': {
				const instance = byId.get(action.instanceId);

				if (instance) {
					await this.remove(instance);
				}

				return;
			}

			default:
				return assertUnreachable(action);
		}
	}

	private async create(service: ScalableService): Promise<void> {
		const config = getScalingConfig();

		if (!config.isAllowed) {
			return;
		}

		const hostPort = pickFreePort(await this.managed.usedHostPorts(), MANAGED_PORT_RANGE);

		if (hostPort === null) {
			throw new Error(`No free port left in ${MANAGED_PORT_RANGE.min}-${MANAGED_PORT_RANGE.max} for ${service.slug}`);
		}

		const shortId = randomBytes(SHORT_ID_BYTES).toString('hex');
		const data: Prisma.ServiceInstanceUncheckedCreateInput = {
			serviceId: service.id,
			name: `${service.slug}-m-${shortId}`,
			url: `http://${config.instanceHost}:${hostPort}`,
			isEnabled: false,
			source: 'managed',
			scalingState: 'provisioning',
			containerName: `pyle-managed-${service.slug}-${shortId}`,
			hostPort,
		};
		const instance = await this.write(
			(transaction) => this.managed.create(data, transaction),
			(created) => toInstanceChange(created, 'created', CREATED),
		);
		const failure = await this.startAndProbe(service, instance);

		if (failure !== null) {
			return this.discard(instance, failure);
		}

		const running: Prisma.ServiceInstanceUpdateInput = { isEnabled: true, scalingState: 'running' };

		await this.write(
			(transaction) => this.managed.update(instance.id, running, transaction),
			(updated) => toInstanceChange(updated, 'updated', { kind: 'replica_running' }),
		);
	}

	// Null when the container is up and healthy, or why it is not.
	private async startAndProbe(service: ScalableService, instance: ServiceInstance): Promise<string | null> {
		const containerName = instance.containerName ?? '';
		const hostPort = instance.hostPort ?? 0;
		const demoServiceName = DEMO_SERVICE_NAME_BY_PROFILE[service.scalingProfile];

		try {
			await this.driver.start({
				containerName,
				hostPort,
				demoServiceName,
				instanceName: instance.name,
				serviceSlug: service.slug,
				instanceId: instance.id,
			});
		} catch (error) {
			return `container did not start: ${toErrorMessage(error)}`;
		}

		const healthUrl = `${instance.url}${service.healthCheckPath}`;
		const isHealthy = await this.probe.waitUntilHealthy(healthUrl, PROVISION_HEALTH_TIMEOUT_MS);

		return isHealthy ? null : `no healthy answer from ${healthUrl} within ${PROVISION_HEALTH_TIMEOUT_MS} ms`;
	}

	private async remove(instance: ServiceInstance): Promise<void> {
		if (instance.scalingState === 'failed') {
			return this.discard(instance, 'cleanup');
		}

		const draining: Prisma.ServiceInstanceUpdateInput = { isEnabled: false, scalingState: 'draining' };

		await this.write(
			(transaction) => this.managed.update(instance.id, draining, transaction),
			(updated) => toInstanceChange(updated, 'updated', { kind: 'replica_draining' }),
		);
		await new Promise((resolve) => setTimeout(resolve, SCALE_DOWN_DRAIN_MS));
		await this.removeContainer(instance);
		const removed: Prisma.ServiceInstanceUpdateInput = { deletedAt: new Date() };

		await this.write(
			(transaction) => this.managed.update(instance.id, removed, transaction),
			(updated) => toInstanceChange(updated, 'deleted', DELETED),
		);
	}

	private async removeContainer(instance: ServiceInstance): Promise<void> {
		if (!instance.containerName) {
			return;
		}

		try {
			await this.driver.remove(instance.containerName);
		} catch (error) {
			// The reconciler removes orphaned containers on its next pass.
			this.logger.warn(`Could not remove ${instance.containerName}: ${toErrorMessage(error)}`);
		}
	}

	// The change is built from the written row (a new one has no id before).
	private async write(
		work: (transaction: Prisma.TransactionClient) => Promise<ServiceInstance>,
		toChange: (instance: ServiceInstance) => ConfigChange,
	): Promise<ServiceInstance> {
		const result = await this.prisma.transaction(async (transaction) => {
			const instance = await work(transaction);
			const recorded = toChange(instance);

			await this.recorder.record(recorded, SCALING_ACTOR, transaction);

			return { instance, recorded };
		});

		await this.recorder.announce([result.recorded]);

		return result.instance;
	}
}
