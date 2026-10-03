import { toBucketStart } from '@pyle/shared/contracts/latency-histogram.js';

import { describeChangeDetail, type ConfigChangeDetail } from '../../gateway-config/domain/config-change-detail.js';
import {
	MS_PER_HOUR,
	MS_PER_MINUTE,
	MS_PER_SECOND,
	SEED_GATEWAY_ID,
	type AlertRow,
	type ConfigChangeRow,
	type Narrative,
	type StateEventRow,
	type SynthesisCatalog,
	type SynthesisInstance,
	type SyntheticHistory,
} from './types.js';

// The one story the Overview and the AI can tell: orders-2 goes slow, then
// users-2 goes down and recovers, with a weight change along the way. The
// timings here are what the row builders use to decide who is slow, who is
// down, and when.

export const SLOW_INSTANCE = { service: 'orders', name: 'orders-2', prefix: '/api/orders' } as const;
export const DOWN_INSTANCE = { service: 'users', name: 'users-2' } as const;
const RESTART_INSTANCE = { service: 'catalog', name: 'catalog-1' } as const;

export const OUTAGE_RETRIED_REQUESTS = 6;

// The operator who doubled a weight in the story.
const WEIGHT_CHANGE: ConfigChangeDetail = { kind: 'fields', changes: [{ field: 'weight', before: 1, after: 3 }] };

export function narrativeFor(nowMs: number): Narrative {
	const slowStartMs = toBucketStart(nowMs - 6 * MS_PER_HOUR);
	const outageStartMs = toBucketStart(nowMs - 2 * MS_PER_HOUR);

	return {
		slowStartMs,
		slowEndMs: slowStartMs + 20 * MS_PER_MINUTE,
		outageStartMs,
		outageEndMs: outageStartMs + 5 * MS_PER_MINUTE,
		weightChangeAtMs: nowMs - 12 * MS_PER_HOUR,
	};
}

export function narrativeEvents(catalog: SynthesisCatalog, narrative: Narrative): Pick<SyntheticHistory, 'stateEvents' | 'alerts' | 'configChanges'> {
	const down = findInstance(catalog, DOWN_INSTANCE.service, DOWN_INSTANCE.name);
	const restarted = findInstance(catalog, RESTART_INSTANCE.service, RESTART_INSTANCE.name);
	const ordersRoute = catalog.routes.find((route) => route.pathPrefix === SLOW_INSTANCE.prefix);
	const at = (baseMs: number, offsetSeconds: number): Date => new Date(baseMs + offsetSeconds * MS_PER_SECOND);
	const { outageStartMs: start, outageEndMs: end } = narrative;
	const stateEvents = down
		? [
				stateEvent(down.instanceId, {
					kind: 'circuit',
					fromState: 'circuit_closed',
					toState: 'circuit_open',
					reason: '5 consecutive request failures (ECONNREFUSED)',
					occurredAt: at(start, 5),
				}),
				stateEvent(down.instanceId, {
					kind: 'health',
					fromState: 'healthy',
					toState: 'unhealthy',
					reason: '3 consecutive failed health checks (ECONNREFUSED)',
					occurredAt: at(start, 15),
				}),
				stateEvent(down.instanceId, {
					kind: 'health',
					fromState: 'unhealthy',
					toState: 'healthy',
					reason: '2 consecutive successful health checks',
					occurredAt: at(end, 10),
				}),
				stateEvent(down.instanceId, {
					kind: 'circuit',
					fromState: 'circuit_open',
					toState: 'circuit_half_open',
					reason: 'cooldown elapsed, probing',
					occurredAt: at(end, 12),
				}),
				stateEvent(down.instanceId, {
					kind: 'circuit',
					fromState: 'circuit_half_open',
					toState: 'circuit_closed',
					reason: 'probe request succeeded',
					occurredAt: at(end, 13),
				}),
			]
		: [];
	const outageAlerts: AlertRow[] = down
		? [
				{
					kind: 'circuit_open',
					severity: 'warning',
					subjectType: 'instance',
					subjectId: down.instanceId,
					message: `The circuit of instance users/${DOWN_INSTANCE.name} is open after repeated request failures: 5 consecutive request failures (ECONNREFUSED)`,
					triggeredAt: at(start, 5),
					resolvedAt: at(end, 13),
				},
				{
					kind: 'instance_unhealthy',
					severity: 'critical',
					subjectType: 'instance',
					subjectId: down.instanceId,
					message: `Instance users/${DOWN_INSTANCE.name} is failing its health checks: 3 consecutive failed health checks (ECONNREFUSED)`,
					triggeredAt: at(start, 15),
					resolvedAt: at(end, 10),
				},
			]
		: [];
	const latencyAlerts: AlertRow[] = ordersRoute
		? [
				{
					kind: 'route_p95_latency',
					severity: 'critical',
					subjectType: 'route',
					subjectId: ordersRoute.routeId,
					message: 'p95 latency 1830 ms for 3 consecutive windows (limit 800 ms)',
					triggeredAt: at(narrative.slowStartMs, 40),
					resolvedAt: at(narrative.slowEndMs, 20),
				},
			]
		: [];
	const configChanges: ConfigChangeRow[] = restarted
		? [
				{
					entityType: 'instance',
					entityId: restarted.instanceId,
					entityName: restarted.name,
					action: 'updated',
					summary: describeChangeDetail(WEIGHT_CHANGE),
					detail: WEIGHT_CHANGE,
					occurredAt: new Date(narrative.weightChangeAtMs),
				},
			]
		: [];

	return { stateEvents, alerts: [...latencyAlerts, ...outageAlerts], configChanges };
}

function findInstance(catalog: SynthesisCatalog, service: string, name: string): SynthesisInstance | undefined {
	return (catalog.instancesByService.get(service) ?? []).find((instance) => instance.name === name);
}

function stateEvent(instanceId: string, change: Omit<StateEventRow, 'instanceId' | 'gatewayId'>): StateEventRow {
	return { instanceId, gatewayId: SEED_GATEWAY_ID, ...change };
}
