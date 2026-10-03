import { describe, expect, it, vi } from 'vitest';

import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import type { ConfigChangeDetail } from '../domain/config-change-detail.js';
import type { ConfigChangeEventRepository } from '../infrastructure/config-change-event.repository.js';
import type { ConfigChangePublisher } from '../infrastructure/config-change-publisher.js';
import { ConfigChangeRecorder, type ConfigChange } from './config-change-recorder.js';
import { TRANSACTION } from './gateway-config-test-kit.fake.js';

const ROUTE_DETAIL: ConfigChangeDetail = { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] };
const ROUTE_CHANGE: ConfigChange = { entityType: 'route', entityId: 'r1', entityName: 'Pedidos', action: 'updated', detail: ROUTE_DETAIL };
const RULE_DETAIL: ConfigChangeDetail = { kind: 'alert_rule', alertKind: 'route_p95_latency', isEnabled: true, threshold: 1200, sustainedWindows: 3 };
const RULE_CHANGE: ConfigChange = {
	entityType: 'alert_rule',
	entityId: 'a1',
	entityName: 'route_p95_latency',
	action: 'updated',
	detail: RULE_DETAIL,
};

function build() {
	const events = { create: vi.fn().mockResolvedValue(undefined) };
	const gatewayPublisher = { publish: vi.fn().mockResolvedValue(undefined) };
	const realtimePublisher = buildRealtimePublisherFake();
	const recorder = new ConfigChangeRecorder(
		events as unknown as ConfigChangeEventRepository,
		gatewayPublisher as unknown as ConfigChangePublisher,
		realtimePublisher,
	);

	return { recorder, events, gatewayPublisher, realtimePublisher };
}

describe('ConfigChangeRecorder', () => {
	it('writes the audit row inside the caller transaction, with the actor', async () => {
		const { recorder, events } = build();

		await recorder.record(ROUTE_CHANGE, { email: 'ops@pyle.local' }, TRANSACTION as never);

		expect(events.create).toHaveBeenCalledWith({ ...ROUTE_CHANGE, summary: 'timeoutMs none -> 2000', actorEmail: 'ops@pyle.local' }, TRANSACTION);
	});

	it('tells the gateways and the console about a gateway entity', async () => {
		const { recorder, gatewayPublisher, realtimePublisher } = build();

		await recorder.announce([ROUTE_CHANGE]);

		expect(gatewayPublisher.publish).toHaveBeenCalledWith({ entity: 'route', id: 'r1', action: 'updated' });
		const realtimeEvent = {
			type: 'config.changed',
			entityType: 'route',
			entityId: 'r1',
			action: 'updated',
			summary: 'timeoutMs none -> 2000',
			detail: ROUTE_DETAIL,
		};

		expect(realtimePublisher.publishToAdmins).toHaveBeenCalledWith(realtimeEvent);
	});

	it('does not bother the gateways about what they do not load', async () => {
		const { recorder, gatewayPublisher, realtimePublisher } = build();

		await recorder.announce([RULE_CHANGE]);

		expect(gatewayPublisher.publish).not.toHaveBeenCalled();
		expect(realtimePublisher.publishToAdmins).toHaveBeenCalledOnce();
	});

	it('survives Redis being down', async () => {
		const { recorder, gatewayPublisher, realtimePublisher } = build();

		gatewayPublisher.publish.mockRejectedValue(new Error('ECONNREFUSED'));

		await expect(recorder.announce([ROUTE_CHANGE])).resolves.toBeUndefined();
		expect(realtimePublisher.publishToAdmins).toHaveBeenCalledOnce();
	});
});
