import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';

import { toRealtimeEventCopy } from './realtimeEventCopy';

const AT = '2026-09-25T10:00:00.000Z';

// Returns the key, so an assertion names the message rather than its text.
const t = ((key: string) => key) as unknown as TFunction;

function copyOf(event: RealtimeEvent) {
	return toRealtimeEventCopy(event, t);
}

function instanceEvent(toState: 'healthy' | 'unhealthy' | 'circuit_closed' | 'circuit_open' | 'circuit_half_open'): RealtimeEvent {
	const kind = toState.startsWith('circuit') ? 'circuit' : 'health';

	return {
		type: 'instance.state.changed',
		serviceId: 's1',
		serviceSlug: 'orders',
		instanceId: 'i2',
		instanceName: 'orders-2',
		kind,
		toState,
		reason: '3 consecutive failed health checks (HTTP 503)',
		occurredAt: AT,
	};
}

const ROUTE_ALERT: RealtimeEvent = {
	type: 'alert.triggered',
	alertId: 'a1',
	kind: 'route_p95_latency',
	severity: 'critical',
	subjectType: 'route',
	subjectId: 'r1',
	subjectName: 'Pedidos',
	message: 'p95 1800 ms',
	occurredAt: AT,
};

const INSTANCE_ALERT: RealtimeEvent = {
	...ROUTE_ALERT,
	kind: 'circuit_open',
	severity: 'warning',
	subjectType: 'instance',
	subjectId: 'i2',
	subjectName: 'orders-2',
};

describe('toRealtimeEventCopy', () => {
	describe('what deserves interrupting the operator', () => {
		it('toasts the facts an operator needs to know right away', () => {
			const prominent: readonly RealtimeEvent[] = [
				instanceEvent('unhealthy'),
				instanceEvent('circuit_open'),
				ROUTE_ALERT,
				{ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT },
				{ type: 'system.component.changed', component: 'control_plane_redis', status: 'down', detail: 'refused', occurredAt: AT },
			];

			expect(prominent.every((event) => copyOf(event).isProminent)).toBe(true);
		});

		it('leaves the rest to the inbox', () => {
			const quiet: readonly RealtimeEvent[] = [
				instanceEvent('healthy'),
				instanceEvent('circuit_half_open'),
				INSTANCE_ALERT,
				{
					type: 'alert.resolved',
					alertId: 'a1',
					kind: 'circuit_open',
					subjectType: 'instance',
					subjectId: 'i2',
					subjectName: 'orders-2',
					occurredAt: AT,
				},
				{ type: 'gateway.status.changed', gatewayId: 'gw', status: 'up', occurredAt: AT },
				{ type: 'gateway.status.changed', gatewayId: 'gw', status: 'stopped', occurredAt: AT },
				{
					type: 'chaos.changed',
					instanceId: 'i2',
					instanceName: 'orders-2',
					serviceSlug: 'orders',
					chaos: { latencyMs: 800, jitterMs: 0, errorRate: 0, isDown: false },
					occurredAt: AT,
				},
				{
					type: 'config.changed',
					entityType: 'route',
					entityId: 'r1',
					action: 'updated',
					summary: 'timeoutMs none -> 2000',
					detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] },
					occurredAt: AT,
				},
				{ type: 'traffic.collected', bucketStart: AT, routeIds: [], bucketMs: 10_000, occurredAt: AT },
				{ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1', occurredAt: AT },
				{ type: 'ai.analysis.ready', scope: 'platform', subjectId: null, subjectName: null, analysisId: 'an1', riskLevel: 'low', occurredAt: AT },
			];

			expect(quiet.every((event) => copyOf(event).isProminent === false)).toBe(true);
		});
	});

	describe('where each event takes the operator', () => {
		it('opens the instance on the Services page', () => {
			expect(copyOf(instanceEvent('unhealthy'))).toMatchObject({
				targetPage: 'services',
				selection: { type: 'service', serviceSlug: 'orders', instanceId: 'i2' },
				detail: 'gateway.reason.failedChecks',
			});
		});

		it('opens a route alert on its traffic', () => {
			expect(copyOf(ROUTE_ALERT)).toMatchObject({ targetPage: 'traffic', selection: { type: 'route-traffic', routeId: 'r1' }, tone: 'danger' });
		});

		it('sends an instance alert to the Services page', () => {
			const copy = copyOf(INSTANCE_ALERT);

			expect(copy).toMatchObject({ targetPage: 'services', tone: 'warning' });
			expect(copy.selection).toBeUndefined();
		});

		it('opens the analysis that became ready', () => {
			const event: RealtimeEvent = {
				type: 'ai.analysis.ready',
				scope: 'route',
				subjectId: 'r1',
				subjectName: 'Pedidos',
				analysisId: 'an1',
				riskLevel: 'high',
				occurredAt: AT,
			};

			expect(copyOf(event)).toMatchObject({ targetPage: 'ai', analysisId: 'an1', tone: 'danger' });
		});
	});

	describe('tones', () => {
		it.each([
			['healthy', 'success'],
			['unhealthy', 'danger'],
			['circuit_closed', 'success'],
			['circuit_open', 'danger'],
			['circuit_half_open', 'warning'],
		] as const)('an instance going %s reads as %s', (toState, tone) => {
			expect(copyOf(instanceEvent(toState)).tone).toBe(tone);
		});

		it('reads a component coming back as good news', () => {
			const event: RealtimeEvent = { type: 'system.component.changed', component: 'gateway', status: 'up', detail: null, occurredAt: AT };

			expect(copyOf(event)).toMatchObject({ tone: 'success', detail: '' });
		});
	});
});
