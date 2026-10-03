import type { Redis } from 'ioredis';

import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';
import { GATEWAY_EVENTS_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { GatewayEventSink } from '../contracts/gateway-event-sink.js';
import type { GatewayLogger } from '../infrastructure/gateway-logger.js';

const LOG_THROTTLE_MS = 60_000;

// Fire and forget: a lost event is logged.
export class RedisEventSink implements GatewayEventSink {
	constructor(
		private readonly redis: Pick<Redis, 'publish'>,
		private readonly logger: GatewayLogger,
	) {}

	emit(event: GatewayEvent): void {
		this.redis.publish(GATEWAY_EVENTS_CHANNEL, JSON.stringify(event)).catch((error: unknown) => {
			this.logger.warnThrottled('event-sink', LOG_THROTTLE_MS, 'Could not publish a gateway event', {
				eventType: event.type,
				error: toErrorMessage(error),
			});
		});
	}
}
