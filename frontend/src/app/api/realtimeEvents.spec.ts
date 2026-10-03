import { afterEach, describe, expect, it, vi } from 'vitest';

import { isAlertEvent, isDataChangingEvent, isEntityChange, stampLocalEvent, toRealtimeEvent, type RealtimeEvent } from './realtimeEvents';

const AT = '2026-09-25T10:00:00.000Z';

const TRAFFIC_COLLECTED: RealtimeEvent = { type: 'traffic.collected', bucketStart: AT, routeIds: ['r1', 'r2'], bucketMs: 10_000, occurredAt: AT };
const INSTANCE_DOWN: RealtimeEvent = {
	type: 'instance.state.changed',
	serviceId: 's1',
	serviceSlug: 'orders',
	instanceId: 'i1',
	instanceName: 'orders-2',
	kind: 'health',
	toState: 'unhealthy',
	reason: '3 consecutive failed health checks (HTTP 503)',
	occurredAt: AT,
};
const CHAOS_CHANGED: RealtimeEvent = {
	type: 'chaos.changed',
	instanceId: 'i1',
	instanceName: 'orders-2',
	serviceSlug: 'orders',
	chaos: { latencyMs: 800, jitterMs: 0, errorRate: 0, isDown: false },
	occurredAt: AT,
};
const ALERT_TRIGGERED: RealtimeEvent = {
	type: 'alert.triggered',
	alertId: 'a1',
	kind: 'route_p95_latency',
	severity: 'warning',
	subjectType: 'route',
	subjectId: 'r1',
	subjectName: 'Pedidos',
	message: 'p95 1200 ms',
	occurredAt: AT,
};
const ALERT_RESOLVED: RealtimeEvent = {
	type: 'alert.resolved',
	alertId: 'a1',
	kind: 'route_p95_latency',
	subjectType: 'route',
	subjectId: 'r1',
	subjectName: 'Pedidos',
	occurredAt: AT,
};
const ROUTE_ROW_CHANGED: RealtimeEvent = { type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1', occurredAt: AT };
const ALERT_ROW_CHANGED: RealtimeEvent = { type: 'entity.changed', entity: 'GatewayAlert', action: 'created', id: 'a1', occurredAt: AT };

const EVERY_EVENT: readonly RealtimeEvent[] = [
	TRAFFIC_COLLECTED,
	INSTANCE_DOWN,
	{
		type: 'config.changed',
		entityType: 'route',
		entityId: 'r1',
		action: 'updated',
		summary: 'timeoutMs none -> 2000',
		detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] },
		occurredAt: AT,
	},
	ALERT_TRIGGERED,
	ALERT_RESOLVED,
	{ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT },
	CHAOS_CHANGED,
	{ type: 'system.component.changed', component: 'gateway', status: 'down', detail: null, occurredAt: AT },
	{ type: 'ai.analysis.ready', scope: 'route', subjectId: 'r1', subjectName: 'Pedidos', analysisId: 'an1', riskLevel: 'high', occurredAt: AT },
	ROUTE_ROW_CHANGED,
];

describe('toRealtimeEvent', () => {
	it.each(EVERY_EVENT)('accepts a known, stamped $type', (event) => {
		expect(toRealtimeEvent(event)).toEqual(event);
	});

	it('drops an event type this build does not know', () => {
		expect(toRealtimeEvent({ type: 'something.unknown', occurredAt: AT })).toBeNull();
	});

	it('drops a known type with no timestamp, which nothing downstream could order', () => {
		expect(toRealtimeEvent({ type: 'traffic.collected', routeIds: [] })).toBeNull();
	});

	it('drops anything that is not an object', () => {
		expect(toRealtimeEvent(null)).toBeNull();
		expect(toRealtimeEvent('traffic.collected')).toBeNull();
		expect(toRealtimeEvent(42)).toBeNull();
	});

	it('drops an object with no type at all', () => {
		expect(toRealtimeEvent({ occurredAt: AT })).toBeNull();
	});
});

describe('isDataChangingEvent', () => {
	it('is true for a domain event broad consumers refetch on', () => {
		expect(isDataChangingEvent(INSTANCE_DOWN)).toBe(true);
	});

	it('is false for the live-only signals, which would otherwise cause a refetch storm', () => {
		expect(isDataChangingEvent(TRAFFIC_COLLECTED)).toBe(false);
		expect(isDataChangingEvent(ROUTE_ROW_CHANGED)).toBe(false);
	});
});

describe('isAlertEvent', () => {
	it('covers both the alert events and a write to the alert table', () => {
		expect(isAlertEvent(ALERT_TRIGGERED)).toBe(true);
		expect(isAlertEvent(ALERT_RESOLVED)).toBe(true);
		expect(isAlertEvent(ALERT_ROW_CHANGED)).toBe(true);
	});

	it('is false for an unrelated event', () => {
		expect(isAlertEvent(INSTANCE_DOWN)).toBe(false);
	});
});

describe('isEntityChange', () => {
	it('matches only the tables the consumer asked about', () => {
		expect(isEntityChange(ROUTE_ROW_CHANGED, ['Route'])).toBe(true);
		expect(isEntityChange(ROUTE_ROW_CHANGED, ['Service'])).toBe(false);
	});

	it('is false for anything that is not an entity change', () => {
		expect(isEntityChange(INSTANCE_DOWN, ['ServiceInstance'])).toBe(false);
	});
});

describe('stampLocalEvent', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('stamps the event the console dispatches after its own mutation', () => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(AT));

		expect(stampLocalEvent({ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1' })).toEqual(ROUTE_ROW_CHANGED);
	});
});
