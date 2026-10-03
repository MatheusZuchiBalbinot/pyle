import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GATEWAY_EVENTS_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import { GatewayEventRelayService, TRAFFIC_COLLECTED_COALESCE_MS, type EventSubscriber } from './gateway-event-relay.service.js';
import type { InstanceStateEventsService } from './instance-state-events.service.js';

const BUCKET = '2026-09-26T12:00:00.000Z';
const STATE_CHANGE = {
	type: 'instance.state.changed',
	gatewayId: 'gw-1',
	instanceId: 'i1',
	kind: 'health',
	fromState: 'healthy',
	toState: 'unhealthy',
	reason: '3 consecutive failed health checks (HTTP 503)',
	occurredAt: BUCKET,
} as const;

function flushed(gatewayId: string, routeIds: readonly string[]): string {
	return JSON.stringify({ type: 'traffic.flushed', gatewayId, bucketStart: BUCKET, routeIds });
}

function build(subscribe = vi.fn().mockResolvedValue(1)) {
	let listener: (channel: string, message: string) => void = () => undefined;
	const subscriber: EventSubscriber = {
		subscribe,
		on: vi.fn((_event: 'message', next: (channel: string, message: string) => void) => (listener = next)),
		quit: vi.fn().mockResolvedValue('OK'),
	};
	const realtime = buildRealtimePublisherFake();
	const instanceStates = { handle: vi.fn().mockResolvedValue(undefined) } as unknown as InstanceStateEventsService;
	const relay = new GatewayEventRelayService(realtime, instanceStates, subscriber);

	return { relay, realtime, instanceStates, subscriber, deliver: (message: string, channel = GATEWAY_EVENTS_CHANNEL) => listener(channel, message) };
}

describe('GatewayEventRelayService', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('announces each bucket once, with the routes every gateway flushed', async () => {
		const { relay, realtime, deliver, subscriber } = build();

		await relay.onModuleInit();
		expect(subscriber.subscribe).toHaveBeenCalledWith(GATEWAY_EVENTS_CHANNEL);

		deliver(flushed('gw-1', ['r1']));
		deliver(flushed('gw-2', ['r1', 'r2']));
		await vi.advanceTimersByTimeAsync(TRAFFIC_COLLECTED_COALESCE_MS);

		expect(realtime.publishToAdmins).toHaveBeenCalledTimes(1);
		expect(realtime.publishToAdmins).toHaveBeenCalledWith({
			type: 'traffic.collected',
			bucketStart: BUCKET,
			routeIds: ['r1', 'r2'],
			bucketMs: 10_000,
		});
		await relay.onModuleDestroy();
	});

	it('hands instance state changes over and ignores the lifecycle events', async () => {
		const { relay, instanceStates, realtime } = build();

		await relay.handleMessage(GATEWAY_EVENTS_CHANNEL, JSON.stringify(STATE_CHANGE));
		await relay.handleMessage(GATEWAY_EVENTS_CHANNEL, JSON.stringify({ type: 'gateway.started', gatewayId: 'gw-1', occurredAt: BUCKET }));
		await relay.handleMessage(
			GATEWAY_EVENTS_CHANNEL,
			JSON.stringify({ type: 'gateway.config.applied', gatewayId: 'gw-1', version: 3, occurredAt: BUCKET }),
		);

		expect(instanceStates.handle).toHaveBeenCalledWith(STATE_CHANGE);
		expect(realtime.publishToAdmins).not.toHaveBeenCalled();
	});

	it('survives garbage, other channels and failures downstream', async () => {
		const { relay, instanceStates, realtime } = build();

		vi.mocked(instanceStates.handle).mockRejectedValueOnce(new Error('db down'));
		vi.mocked(realtime.publishToAdmins).mockRejectedValueOnce(new Error('centrifugo down'));

		await relay.handleMessage(GATEWAY_EVENTS_CHANNEL, '{garbage');
		await relay.handleMessage('another-channel', JSON.stringify(STATE_CHANGE));
		await relay.handleMessage(GATEWAY_EVENTS_CHANNEL, JSON.stringify(STATE_CHANGE));
		await relay.handleMessage(GATEWAY_EVENTS_CHANNEL, flushed('gw-1', []));
		await vi.advanceTimersByTimeAsync(TRAFFIC_COLLECTED_COALESCE_MS);

		expect(instanceStates.handle).toHaveBeenCalledTimes(1);
	});

	it('boots without Redis and drops pending announcements on shutdown', async () => {
		const { relay, realtime, deliver, subscriber } = build(vi.fn().mockRejectedValue(new Error('no redis')));

		await relay.onModuleInit();
		deliver(flushed('gw-1', ['r1']));
		vi.mocked(subscriber.quit).mockRejectedValue(new Error('closed'));

		await relay.onModuleDestroy();
		await vi.advanceTimersByTimeAsync(TRAFFIC_COLLECTED_COALESCE_MS);

		expect(realtime.publishToAdmins).not.toHaveBeenCalled();
	});
});
