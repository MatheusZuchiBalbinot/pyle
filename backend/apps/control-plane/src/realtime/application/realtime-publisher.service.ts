import { Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getRealtimeConfig } from '../../config/realtime.js';
import { ADMIN_EVENTS_CHANNEL, type RealtimeEvent, type RealtimeEventBody } from '../domain/realtime-event.js';
import { CentrifugoNodeClient, type CentrifugoNode } from '../infrastructure/centrifugo-node-client.js';

type RealtimeEventListener = (event: RealtimeEvent) => void | Promise<void>;

// Best effort: the event describes state already in Postgres, so a broker hiccup is logged,
// never thrown.
@Injectable()
export class RealtimePublisherService {
	private readonly logger = new Logger(RealtimePublisherService.name);
	private readonly adminListeners = new Set<RealtimeEventListener>();
	private readonly controlPlaneBroker: CentrifugoNode;

	constructor(private readonly nodeClient: CentrifugoNodeClient) {
		const config = getRealtimeConfig();

		this.controlPlaneBroker = { apiUrl: config.apiUrl, apiKey: config.apiKey };
	}

	// For code that reacts to the same facts the console hears (overview cache, inbox).
	onAdminEvent(listener: RealtimeEventListener): () => void {
		this.adminListeners.add(listener);

		return () => {
			this.adminListeners.delete(listener);
		};
	}

	// Listeners finish before the broker publish, so what they persist is visible when the
	// console reacts.
	async publishToAdmins(body: RealtimeEventBody): Promise<void> {
		const event = this.stamp(body);

		await Promise.all([...this.adminListeners].map((listener) => this.runListener(listener, event)));
		await this.publish(this.controlPlaneBroker, ADMIN_EVENTS_CHANNEL, event);
	}

	private async runListener(listener: RealtimeEventListener, event: RealtimeEvent): Promise<void> {
		try {
			await listener(event);
		} catch (error) {
			this.logger.warn(`Admin event listener failed for ${event.type}: ${toErrorMessage(error)}`);
		}
	}

	private stamp(body: RealtimeEventBody): RealtimeEvent {
		return { ...body, occurredAt: new Date().toISOString() };
	}

	private async publish(node: CentrifugoNode, channel: string, event: RealtimeEvent): Promise<void> {
		try {
			await this.nodeClient.publish(node, channel, event);
		} catch (error) {
			this.logger.warn(`Failed to publish ${event.type} to ${channel}: ${toErrorMessage(error)}`);
		}
	}
}
