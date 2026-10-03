import { describe, expect, it } from 'vitest';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';

import { isInstanceChangeEvent } from './instanceChangeEvents';

const AT = '2026-10-01T00:00:00.000Z';
const NO_CHAOS = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };

function chaosOn(instanceId: string): RealtimeEvent {
	return { type: 'chaos.changed', instanceId, instanceName: 'orders-2', serviceSlug: 'orders', chaos: NO_CHAOS, occurredAt: AT };
}

function configChange(entityType: 'instance' | 'route', entityId: string): RealtimeEvent {
	return { type: 'config.changed', entityType, entityId, action: 'updated', summary: 'weight 1 -> 3', detail: { kind: 'created' }, occurredAt: AT };
}

describe('isInstanceChangeEvent', () => {
	it('matches chaos and edits on this instance', () => {
		expect(isInstanceChangeEvent(chaosOn('i2'), 'i2')).toBe(true);
		expect(isInstanceChangeEvent(configChange('instance', 'i2'), 'i2')).toBe(true);
	});

	it('ignores other instances, other entities and other events', () => {
		expect(isInstanceChangeEvent(chaosOn('i3'), 'i2')).toBe(false);
		expect(isInstanceChangeEvent(configChange('instance', 'i3'), 'i2')).toBe(false);
		expect(isInstanceChangeEvent(configChange('route', 'i2'), 'i2')).toBe(false);
		expect(isInstanceChangeEvent({ type: 'traffic.collected', bucketStart: AT, routeIds: [], bucketMs: 10_000, occurredAt: AT }, 'i2')).toBe(false);
	});
});
