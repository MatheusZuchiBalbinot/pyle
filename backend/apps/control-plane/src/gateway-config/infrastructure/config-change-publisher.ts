import { Injectable } from '@nestjs/common';

import type { ConfigChangedMessage } from '@pyle/shared/contracts/gateway-events.js';
import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';

@Injectable()
export class ConfigChangePublisher {
	constructor(private readonly redis: ControlPlaneRedisService) {}

	async publish(message: ConfigChangedMessage): Promise<void> {
		await this.redis.publish(CONFIG_CHANGED_CHANNEL, JSON.stringify(message));
	}
}
