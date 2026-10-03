import { describe, expect, it, vi } from 'vitest';

import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import type { GatewayAlertService } from '../alerts/application/gateway-alert.service.js';
import type { InstanceStateEventRepository } from '../infrastructure/instance-state-event.repository.js';
import type { TrafficNamesRepository } from '../infrastructure/traffic-names.repository.js';
import { InstanceStateEventsService, type InstanceStateChangedEvent } from './instance-state-events.service.js';

const EVENT: InstanceStateChangedEvent = {
	type: 'instance.state.changed',
	gatewayId: 'gw-1',
	instanceId: 'i1',
	kind: 'circuit',
	fromState: 'circuit_closed',
	toState: 'circuit_open',
	reason: '5 consecutive request failures (timeout)',
	occurredAt: '2026-09-26T12:00:00.000Z',
};

function build(isKnown = true) {
	const instance = { id: 'i1', name: 'orders-2', serviceId: 's1', serviceSlug: 'orders' };
	const names = { instances: vi.fn().mockResolvedValue(new Map(isKnown ? [['i1', instance]] : [])) } as unknown as TrafficNamesRepository;
	const events = { record: vi.fn().mockResolvedValue(undefined) } as unknown as InstanceStateEventRepository;
	const alerts = { onInstanceStateChanged: vi.fn().mockResolvedValue(undefined) } as unknown as GatewayAlertService;
	const realtime = buildRealtimePublisherFake();

	return { service: new InstanceStateEventsService(events, names, realtime, alerts), events, alerts, realtime };
}

describe('InstanceStateEventsService', () => {
	it('keeps the transition, tells the console and raises the alert', async () => {
		const { service, events, alerts, realtime } = build();

		await service.handle(EVENT);

		expect(events.record).toHaveBeenCalledWith({
			instanceId: 'i1',
			gatewayId: 'gw-1',
			kind: 'circuit',
			fromState: 'circuit_closed',
			toState: 'circuit_open',
			reason: EVENT.reason,
			occurredAt: new Date(EVENT.occurredAt),
		});
		expect(realtime.publishToAdmins).toHaveBeenCalledWith({
			type: 'instance.state.changed',
			serviceId: 's1',
			serviceSlug: 'orders',
			instanceId: 'i1',
			instanceName: 'orders-2',
			kind: 'circuit',
			toState: 'circuit_open',
			reason: EVENT.reason,
		});
		expect(alerts.onInstanceStateChanged).toHaveBeenCalledWith({
			instanceId: 'i1',
			instanceName: 'orders/orders-2',
			kind: 'circuit',
			toState: 'circuit_open',
			reason: EVENT.reason,
		});
	});

	it('ignores instances it has never heard of', async () => {
		const { service, events, realtime } = build(false);

		await service.handle(EVENT);

		expect(events.record).not.toHaveBeenCalled();
		expect(realtime.publishToAdmins).not.toHaveBeenCalled();
	});
});
