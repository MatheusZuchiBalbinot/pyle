import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { EntityChangeBus } from '../../control-plane/entity-changes/entity-change-bus.service.js';
import type { EntityChange } from '../../control-plane/entity-changes/entity-change.js';
import { BROADCAST_ENTITIES, type BroadcastEntity } from '../domain/realtime-event.js';
import { RealtimePublisherService } from './realtime-publisher.service.js';

const BROADCAST_ENTITY_SET: ReadonlySet<string> = new Set(BROADCAST_ENTITIES);

// Best effort: a failure is logged, never surfaced.
@Injectable()
export class EntityChangeBroadcaster implements OnModuleInit {
	private readonly logger = new Logger(EntityChangeBroadcaster.name);

	constructor(
		private readonly entityChanges: EntityChangeBus,
		private readonly realtimePublisher: RealtimePublisherService,
	) {}

	onModuleInit(): void {
		this.entityChanges.onModelChange(BROADCAST_ENTITIES, (change) => {
			void this.broadcast(change);
		});
	}

	private async broadcast(change: EntityChange): Promise<void> {
		if (!isBroadcastEntity(change.model)) {
			return;
		}

		try {
			await this.realtimePublisher.publishToAdmins({ type: 'entity.changed', entity: change.model, action: change.action, id: change.id });
		} catch (error) {
			this.logger.warn(`Could not broadcast ${change.model} ${change.action}: ${toErrorMessage(error)}`);
		}
	}
}

function isBroadcastEntity(model: string): model is BroadcastEntity {
	return BROADCAST_ENTITY_SET.has(model);
}
