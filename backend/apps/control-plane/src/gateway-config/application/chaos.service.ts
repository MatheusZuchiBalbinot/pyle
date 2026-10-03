import { Injectable } from '@nestjs/common';

import { NO_CHAOS, type ChaosState } from '@pyle/shared/contracts/chaos-state.js';

import { getChaosConfig } from '../../config/chaos.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { RealtimeEventBody } from '../../realtime/domain/realtime-event.js';
import { ChaosDisabledError } from '../domain/config-errors.js';
import { ChaosStateStore } from '../infrastructure/chaos-state.store.js';
import { DemoChaosClient } from '../infrastructure/demo-chaos.client.js';
import { ConfigChangeRecorder, type ConfigActor } from './config-change-recorder.js';
import { InstancesService, toInstanceChange } from './instances.service.js';
import { ServicesService } from './services.service.js';

type ChaosTarget = { readonly serviceSlug: string; readonly instanceId: string };

// Off unless CHAOS_ALLOWED.
@Injectable()
export class ChaosService {
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly services: ServicesService,
		private readonly instances: InstancesService,
		private readonly client: DemoChaosClient,
		private readonly store: ChaosStateStore,
		private readonly recorder: ConfigChangeRecorder,
		private readonly realtimePublisher: RealtimePublisherService,
	) {}

	async apply(target: ChaosTarget, chaos: ChaosState, actor: ConfigActor): Promise<ChaosState> {
		const config = getChaosConfig();

		if (!config.isAllowed) {
			throw new ChaosDisabledError('Chaos is disabled on this control plane (CHAOS_ALLOWED=false)');
		}

		const service = await this.services.findOrThrow(target.serviceSlug);
		const instance = await this.instances.findOrThrow(service, target.instanceId);

		await this.client.apply({ instanceUrl: instance.url, token: config.token, chaos });
		await this.store.save(instance.id, chaos);
		const change = toInstanceChange(instance, 'updated', { kind: 'chaos', ...chaos });

		// Not announced to the gateways: chaos changes the instance, not the configuration.
		await this.recorder.record(change, actor, this.prisma);
		const event: RealtimeEventBody = {
			type: 'chaos.changed',
			instanceId: instance.id,
			instanceName: instance.name,
			serviceSlug: service.slug,
			chaos,
		};

		await this.realtimePublisher.publishToAdmins(event);

		return chaos;
	}

	async clear(target: ChaosTarget, actor: ConfigActor): Promise<ChaosState> {
		const cleared = await this.apply(target, NO_CHAOS, actor);

		await this.store.clear(target.instanceId);

		return cleared;
	}
}
