import { Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { ChaosStateStore } from '../infrastructure/chaos-state.store.js';
import { InstanceLiveStateReader } from '../infrastructure/instance-live-state.reader.js';
import { NO_RUNTIME, type InstanceRuntime } from '../interface/dto/gateway-config-responses.js';

// Optional: with Redis down the configuration still loads, without the live columns.
@Injectable()
export class InstanceRuntimeService {
	private readonly logger = new Logger(InstanceRuntimeService.name);

	constructor(
		private readonly liveStates: InstanceLiveStateReader,
		private readonly chaosStates: ChaosStateStore,
	) {}

	async load(instanceIds: readonly string[]): Promise<InstanceRuntime> {
		try {
			const [liveByInstanceId, chaosByInstanceId] = await Promise.all([this.liveStates.readAll(), this.chaosStates.readMany(instanceIds)]);

			return { liveByInstanceId, chaosByInstanceId };
		} catch (error) {
			this.logger.warn(`Could not read live instance state: ${toErrorMessage(error)}`);

			return NO_RUNTIME;
		}
	}
}
