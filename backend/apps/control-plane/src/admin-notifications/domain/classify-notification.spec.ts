import { describe, expect, it } from 'vitest';

import type { RealtimeEvent } from '../../realtime/domain/realtime-event.js';
import { classifyNotification } from './classify-notification.js';

const AT = '2026-09-25T00:00:00.000Z';

function instanceEvent(toState: 'healthy' | 'unhealthy' | 'circuit_closed' | 'circuit_open' | 'circuit_half_open'): RealtimeEvent {
	const kind = toState.startsWith('circuit') ? 'circuit' : 'health';

	return {
		type: 'instance.state.changed',
		serviceId: 's1',
		serviceSlug: 'orders',
		instanceId: 'i1',
		instanceName: 'orders-2',
		kind,
		toState,
		reason: 'r',
		occurredAt: AT,
	};
}

describe('classifyNotification', () => {
	it.each<RealtimeEvent>([
		{ type: 'traffic.collected', bucketStart: AT, routeIds: ['r1'], bucketMs: 10_000, occurredAt: AT },
		{ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1', occurredAt: AT },
		{
			type: 'config.changed',
			entityType: 'route',
			entityId: 'r1',
			action: 'updated',
			summary: 'timeoutMs none -> 2000',
			detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] },
			occurredAt: AT,
		},
		instanceEvent('circuit_half_open'),
	])('keeps $type live-only', (event) => {
		expect(classifyNotification(event)).toBeNull();
	});

	it.each([
		['unhealthy', 'danger'],
		['circuit_open', 'danger'],
		['healthy', 'success'],
		['circuit_closed', 'success'],
	] as const)('files an instance going %s as %s', (toState, severity) => {
		expect(classifyNotification(instanceEvent(toState))).toEqual({ category: 'instance', severity, subject: { type: 'instance', id: 'i1' } });
	});

	it.each([
		['critical', 'danger'],
		['warning', 'warning'],
	] as const)('files a %s alert as %s traffic news about its subject', (alertSeverity, severity) => {
		const event: RealtimeEvent = {
			type: 'alert.triggered',
			alertId: 'a1',
			kind: 'route_p95_latency',
			severity: alertSeverity,
			subjectType: 'route',
			subjectId: 'r1',
			subjectName: 'Pedidos',
			message: 'p95 1200 ms',
			occurredAt: AT,
		};

		expect(classifyNotification(event)).toEqual({ category: 'traffic', severity, subject: { type: 'route', id: 'r1' } });
	});

	it('files a resolved alert as good news', () => {
		const event: RealtimeEvent = {
			type: 'alert.resolved',
			alertId: 'a1',
			kind: 'circuit_open',
			subjectType: 'instance',
			subjectId: 'i1',
			subjectName: 'orders-2',
			occurredAt: AT,
		};

		expect(classifyNotification(event)).toEqual({ category: 'traffic', severity: 'success', subject: { type: 'instance', id: 'i1' } });
	});

	it.each([
		['down', 'danger'],
		['stopped', 'info'],
		['up', 'success'],
	] as const)('files the gateway going %s as %s', (status, severity) => {
		const event: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status, occurredAt: AT };

		expect(classifyNotification(event)).toEqual({ category: 'system', severity, subject: null });
	});

	it('files injected chaos as informational news about the instance', () => {
		const event: RealtimeEvent = {
			type: 'chaos.changed',
			instanceId: 'i1',
			instanceName: 'orders-2',
			serviceSlug: 'orders',
			chaos: { latencyMs: 800, jitterMs: 0, errorRate: 0, isDown: false },
			occurredAt: AT,
		};

		expect(classifyNotification(event)).toEqual({ category: 'system', severity: 'info', subject: { type: 'instance', id: 'i1' } });
	});

	it.each([
		['up', 'success'],
		['degraded', 'danger'],
		['down', 'danger'],
	] as const)('files a component going %s as %s', (status, severity) => {
		const event: RealtimeEvent = { type: 'system.component.changed', component: 'control_plane_redis', status, detail: null, occurredAt: AT };

		expect(classifyNotification(event)).toEqual({ category: 'system', severity, subject: null });
	});

	it.each([
		['high', 'danger'],
		['low', 'info'],
	] as const)('files an analysis with %s risk as %s', (riskLevel, severity) => {
		const event: RealtimeEvent = {
			type: 'ai.analysis.ready',
			scope: 'route',
			subjectId: 'r1',
			subjectName: 'Pedidos',
			analysisId: 'an1',
			riskLevel,
			occurredAt: AT,
		};

		expect(classifyNotification(event)).toEqual({ category: 'ai', severity, subject: null });
	});
});
