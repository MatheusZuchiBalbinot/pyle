import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ServiceInstance } from '@prisma/control-plane-client';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getScalingConfig } from '../../config/scaling.js';
import { ManagedInstanceRepository } from '../infrastructure/managed-instance.repository.js';
import { ContainerDriver } from './scaling-ports.js';
import { ScalingService } from './scaling.service.js';

// Removes orphaned containers, discards instances whose container is gone (or left half-
// done by a restart) and converges every service. Runs in scaling's queue.
@Injectable()
export class InstanceReconciler implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(InstanceReconciler.name);
	private timer: NodeJS.Timeout | null = null;

	constructor(
		private readonly scaling: ScalingService,
		private readonly managed: ManagedInstanceRepository,
		private readonly driver: ContainerDriver,
	) {}

	onModuleInit(): void {
		const config = getScalingConfig();

		if (!config.isAllowed) {
			return;
		}

		void this.scheduleRun();
		this.timer = setInterval(() => void this.scheduleRun(), config.reconciliationIntervalMs);
	}

	onModuleDestroy(): void {
		if (this.timer) {
			clearInterval(this.timer);
		}

		this.timer = null;
	}

	scheduleRun(): Promise<void> {
		return this.scaling.runExclusive(() => this.reconcile());
	}

	private async reconcile(): Promise<void> {
		const isReachable = await this.driver.isReachable();

		if (!isReachable) {
			this.logger.warn('Docker is unreachable; skipping this reconciliation');

			return;
		}

		const containers = await this.driver.listManaged();
		const instances = await this.managed.listAllManaged();

		await this.removeOrphans(
			containers.map((container) => container.name),
			instances,
		);
		const runningNames = new Set(containers.filter((container) => container.isRunning).map((container) => container.name));

		for (const instance of instances) {
			const problem = describeProblem(instance, runningNames);

			if (problem !== null) {
				await this.scaling.discard(instance, problem);
			}
		}

		for (const service of await this.managed.listScalable()) {
			await this.scaling.converge(service.id);
		}
	}

	private async removeOrphans(containerNames: readonly string[], instances: readonly ServiceInstance[]): Promise<void> {
		const ownedNames = new Set(instances.flatMap((instance) => (instance.containerName ? [instance.containerName] : [])));

		for (const name of containerNames.filter((candidate) => !ownedNames.has(candidate))) {
			this.logger.warn(`Removing orphaned managed container ${name}`);
			await this.driver.remove(name).catch((error: unknown) => this.logger.warn(`Could not remove ${name}: ${toErrorMessage(error)}`));
		}
	}
}

// Nothing else runs meanwhile, so an instance still provisioning or draining was left so by
// a restart.
function describeProblem(instance: ServiceInstance, runningNames: ReadonlySet<string>): string | null {
	if (instance.scalingState === 'provisioning') {
		return 'left provisioning by a restart';
	}

	if (instance.scalingState === 'draining') {
		return 'left draining by a restart';
	}

	const isRunning = instance.containerName !== null && runningNames.has(instance.containerName);

	if (!isRunning) {
		return 'its container is not running';
	}

	return null;
}
