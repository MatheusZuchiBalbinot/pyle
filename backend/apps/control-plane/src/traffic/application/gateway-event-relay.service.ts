import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';

import { parseGatewayEvent, type GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';
import { TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';
import { GATEWAY_EVENTS_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getControlPlaneRedisUrl } from '../../config/control-plane-redis.js';
import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import { InstanceStateEventsService } from './instance-state-events.service.js';

// Several gateways flush the same bucket within a moment of each other:
// the console hears about each bucket once, with every route in it.
export const TRAFFIC_COLLECTED_COALESCE_MS = 500;
const LOGGED_MESSAGE_PREFIX_LENGTH = 200;

export type EventSubscriber = {
	subscribe(channel: string): Promise<unknown>;
	on(event: 'message', listener: (channel: string, message: string) => void): unknown;
	quit(): Promise<unknown>;
};

type PendingBucket = {
	readonly routeIds: Set<string>;
	readonly timer: NodeJS.Timeout;
};

@Injectable()
export class GatewayEventRelayService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(GatewayEventRelayService.name);
	private readonly subscriber: EventSubscriber;
	private readonly pendingBuckets = new Map<string, PendingBucket>();

	constructor(
		private readonly realtime: RealtimePublisherService,
		private readonly instanceStates: InstanceStateEventsService,
		@Optional() subscriber?: EventSubscriber,
	) {
		this.subscriber = subscriber ?? new Redis(getControlPlaneRedisUrl(), { lazyConnect: true });
	}

	async onModuleInit(): Promise<void> {
		this.subscriber.on('message', (channel, message) => void this.handleMessage(channel, message));

		try {
			await this.subscriber.subscribe(GATEWAY_EVENTS_CHANNEL);
		} catch (error) {
			// ioredis resubscribes on its own once Redis is back.
			this.logger.warn(`Could not subscribe to gateway events yet: ${toErrorMessage(error)}`);
		}
	}

	async onModuleDestroy(): Promise<void> {
		for (const pending of this.pendingBuckets.values()) {
			clearTimeout(pending.timer);
		}

		this.pendingBuckets.clear();
		await this.subscriber.quit().catch(() => {
			// Never connected, or already gone: nothing to close.
		});
	}

	async handleMessage(channel: string, message: string): Promise<void> {
		if (channel !== GATEWAY_EVENTS_CHANNEL) {
			return;
		}

		const event = parseGatewayEvent(message);

		if (event === null) {
			this.logger.warn(`Ignoring a malformed gateway event: ${message.slice(0, LOGGED_MESSAGE_PREFIX_LENGTH)}`);

			return;
		}

		try {
			await this.relay(event);
		} catch (error) {
			this.logger.error(`Could not relay ${event.type} from ${event.gatewayId}: ${toErrorMessage(error)}`);
		}
	}

	private relay(event: GatewayEvent): Promise<void> {
		if (event.type === 'traffic.flushed') {
			this.coalesceTrafficFlush(event.bucketStart, event.routeIds);

			return Promise.resolve();
		}

		if (event.type === 'instance.state.changed') {
			return this.instanceStates.handle(event);
		}

		if (event.type === 'gateway.started') {
			this.logger.log(`Gateway ${event.gatewayId} started`);

			return Promise.resolve();
		}

		if (event.type === 'gateway.config.applied') {
			this.logger.log(`Gateway ${event.gatewayId} applied configuration ${event.version}`);

			return Promise.resolve();
		}

		assertUnreachable(event);
	}

	private coalesceTrafficFlush(bucketStart: string, routeIds: readonly string[]): void {
		const pending = this.pendingBuckets.get(bucketStart);

		if (pending) {
			for (const routeId of routeIds) {
				pending.routeIds.add(routeId);
			}

			return;
		}

		const timer = setTimeout(() => void this.publishTrafficCollected(bucketStart), TRAFFIC_COLLECTED_COALESCE_MS);

		this.pendingBuckets.set(bucketStart, { routeIds: new Set(routeIds), timer });
	}

	private async publishTrafficCollected(bucketStart: string): Promise<void> {
		const pending = this.pendingBuckets.get(bucketStart);

		this.pendingBuckets.delete(bucketStart);

		if (!pending) {
			return;
		}

		try {
			await this.realtime.publishToAdmins({ type: 'traffic.collected', bucketStart, routeIds: [...pending.routeIds], bucketMs: TRAFFIC_BUCKET_MS });
		} catch (error) {
			this.logger.warn(`Could not announce traffic for ${bucketStart}: ${toErrorMessage(error)}`);
		}
	}
}
