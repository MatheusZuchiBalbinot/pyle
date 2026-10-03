import { Injectable, Logger } from '@nestjs/common';

import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';

import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import { GatewayAlertService } from '../alerts/application/gateway-alert.service.js';
import { InstanceStateEventRepository } from '../infrastructure/instance-state-event.repository.js';
import { instanceDisplayName, TrafficNamesRepository } from '../infrastructure/traffic-names.repository.js';

export type InstanceStateChangedEvent = Extract<GatewayEvent, { readonly type: 'instance.state.changed' }>;

// Kept as history, told to the console and turned into an alert at once. Transitions are
// rare, so names are looked up each time.
@Injectable()
export class InstanceStateEventsService {
	private readonly logger = new Logger(InstanceStateEventsService.name);

	constructor(
		private readonly events: InstanceStateEventRepository,
		private readonly names: TrafficNamesRepository,
		private readonly realtime: RealtimePublisherService,
		private readonly alerts: GatewayAlertService,
	) {}

	async handle(event: InstanceStateChangedEvent): Promise<void> {
		const { instanceId, gatewayId, kind, fromState, toState, reason } = event;
		const instances = await this.names.instances([instanceId]);
		const instance = instances.get(instanceId);

		if (!instance) {
			this.logger.warn(`State change for unknown instance ${instanceId} from ${gatewayId}; ignored`);

			return;
		}

		await this.events.record({ instanceId, gatewayId, kind, fromState, toState, reason, occurredAt: new Date(event.occurredAt) });
		this.logger.log(`Instance ${instanceDisplayName(instance)} ${kind} → ${toState} (${reason}) on ${gatewayId}`);
		await this.realtime.publishToAdmins({
			type: 'instance.state.changed',
			serviceId: instance.serviceId,
			serviceSlug: instance.serviceSlug,
			instanceId,
			instanceName: instance.name,
			kind,
			toState,
			reason,
		});
		await this.alerts.onInstanceStateChanged({ instanceId, instanceName: instanceDisplayName(instance), kind, toState, reason });
	}
}
