import { Injectable, Logger } from '@nestjs/common';

import { CONFIG_CHANGED_ENTITY_NAMES, type ConfigChangedEntityName } from '@pyle/shared/contracts/gateway-events.js';
import { isOneOf, type ConfigChangeActionName, type ConfigEntityTypeName } from '@pyle/shared/contracts/names.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import { describeChangeDetail, type ConfigChangeDetail } from '../domain/config-change-detail.js';
import { ConfigChangeEventRepository } from '../infrastructure/config-change-event.repository.js';
import { ConfigChangePublisher } from '../infrastructure/config-change-publisher.js';
import type { PrismaExecutor } from '../infrastructure/prisma-client.js';

// Null for the service token (scripts, the seeder).
export type ConfigActor = { readonly email: string | null };

export type ConfigChange = {
	readonly entityType: ConfigEntityTypeName;
	readonly entityId: string;
	// As it was at the time: the history keeps reading right after a rename or a delete.
	readonly entityName: string;
	readonly action: ConfigChangeActionName;
	readonly detail: ConfigChangeDetail;
};

// record() inside the write's transaction; announce() after commit.
@Injectable()
export class ConfigChangeRecorder {
	private readonly logger = new Logger(ConfigChangeRecorder.name);

	constructor(
		private readonly events: ConfigChangeEventRepository,
		private readonly gatewayPublisher: ConfigChangePublisher,
		private readonly realtimePublisher: RealtimePublisherService,
	) {}

	async record(change: ConfigChange, actor: ConfigActor, executor: PrismaExecutor): Promise<void> {
		const summary = describeChangeDetail(change.detail);

		await this.events.create({ ...change, summary, actorEmail: actor.email }, executor);
	}

	// Best effort: a gateway that misses the message reloads on its periodic refresh.
	async announce(changes: readonly ConfigChange[]): Promise<void> {
		for (const change of changes) {
			await this.publishToGateways(change);
			const { entityType, entityId, action, detail } = change;

			await this.realtimePublisher.publishToAdmins({
				type: 'config.changed',
				entityType,
				entityId,
				action,
				summary: describeChangeDetail(detail),
				detail,
			});
		}
	}

	private async publishToGateways(change: ConfigChange): Promise<void> {
		if (!isGatewayEntity(change.entityType)) {
			return;
		}

		try {
			await this.gatewayPublisher.publish({ entity: change.entityType, id: change.entityId, action: change.action });
		} catch (error) {
			this.logger.warn(`Could not tell the gateways about ${change.entityType} ${change.entityId}: ${toErrorMessage(error)}`);
		}
	}
}

function isGatewayEntity(entityType: ConfigEntityTypeName): entityType is ConfigChangedEntityName {
	return isOneOf(CONFIG_CHANGED_ENTITY_NAMES, entityType);
}
