import { describe, expect, it } from 'vitest';

import { parseConfigChangedMessage, parseGatewayEvent, type GatewayEvent } from './gateway-events.js';

const VALID_EVENTS: readonly GatewayEvent[] = [
	{ type: 'traffic.flushed', gatewayId: 'gw', bucketStart: '2026-09-25T10:00:00.000Z', routeIds: ['r1'] },
	{
		type: 'instance.state.changed',
		gatewayId: 'gw',
		instanceId: 'i1',
		kind: 'circuit',
		fromState: 'circuit_closed',
		toState: 'circuit_open',
		reason: '5 consecutive request failures (timeout)',
		occurredAt: '2026-09-25T10:00:00.000Z',
	},
	{ type: 'gateway.started', gatewayId: 'gw', occurredAt: '2026-09-25T10:00:00.000Z' },
	{ type: 'gateway.config.applied', gatewayId: 'gw', version: 1, occurredAt: '2026-09-25T10:00:00.000Z' },
];

describe('parseGatewayEvent', () => {
	it.each(VALID_EVENTS)('round-trips $type', (event) => {
		expect(parseGatewayEvent(JSON.stringify(event))).toEqual(event);
	});

	it.each([
		['invalid JSON', '{nope'],
		['a non-object', '[1,2]'],
		['an unknown type', JSON.stringify({ type: 'something.else', gatewayId: 'gw' })],
		['a prototype key as type', JSON.stringify({ type: 'toString' })],
		['a wrong field type', JSON.stringify({ type: 'traffic.flushed', gatewayId: 'gw', bucketStart: 'x', routeIds: [1] })],
		['an unknown state', JSON.stringify({ ...VALID_EVENTS[1], toState: 'melting' })],
		['a missing field', JSON.stringify({ type: 'gateway.config.applied', gatewayId: 'gw', occurredAt: 'x' })],
		['a missing started field', JSON.stringify({ type: 'gateway.started', gatewayId: 'gw' })],
	])('rejects %s', (_label, raw) => {
		expect(parseGatewayEvent(raw)).toBeNull();
	});
});

describe('parseConfigChangedMessage', () => {
	it('parses a valid message', () => {
		const message = { entity: 'route', id: 'r1', action: 'updated' };

		expect(parseConfigChangedMessage(JSON.stringify(message))).toEqual(message);
	});

	it.each([
		['invalid JSON', 'x'],
		['an entity the data plane does not load', JSON.stringify({ entity: 'alert_rule', id: 'a', action: 'updated' })],
		['an unknown action', JSON.stringify({ entity: 'route', id: 'r1', action: 'renamed' })],
	])('rejects %s', (_label, raw) => {
		expect(parseConfigChangedMessage(raw)).toBeNull();
	});
});
