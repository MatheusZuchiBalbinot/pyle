import { describe, expect, it } from 'vitest';

import type { ServiceInstance } from '@/app/api/adminApiTypes';
import { buildInstance, buildLiveState, buildService } from '@/test/gatewayFixtures';

import { buildReplicaOverview, deriveReplicaState, type ReplicaSlot } from './replicaSlots';

const MAX = 6;

function managed(name: string, overrides: Partial<ServiceInstance> = {}): ServiceInstance {
	return buildInstance(name, { source: 'managed', scalingState: 'running', ...overrides });
}

function describeSlot(slot: ReplicaSlot): string {
	if (slot.kind === 'replica') {
		return `${slot.instance.name}:${slot.state}`;
	}

	return slot.kind;
}

describe('deriveReplicaState', () => {
	it('maps each lifecycle state', () => {
		expect(deriveReplicaState(managed('a', { scalingState: 'provisioning' }))).toBe('starting');
		expect(deriveReplicaState(managed('a', { scalingState: 'draining' }))).toBe('leaving');
		expect(deriveReplicaState(managed('a', { scalingState: 'failed' }))).toBe('failed');
		expect(deriveReplicaState(managed('a', { scalingState: null }))).toBe('starting');
		expect(deriveReplicaState(managed('a'))).toBe('running');
	});

	it('marks a running replica out of rotation as unhealthy', () => {
		const unhealthy = managed('a', { live: buildLiveState({ instanceId: 'id-a', health: 'unhealthy' }) });
		const circuitOpen = managed('b', { live: buildLiveState({ instanceId: 'id-b', circuit: 'open' }) });

		expect(deriveReplicaState(unhealthy)).toBe('unhealthy');
		expect(deriveReplicaState(circuitOpen)).toBe('unhealthy');
	});
});

describe('buildReplicaOverview', () => {
	it('orders replicas by state, ignores static instances and fills free room up to the max', () => {
		const service = buildService('orders', {
			scaling: { profile: 'demo_orders', desiredManagedReplicas: 3 },
			instances: [
				buildInstance('orders-1'),
				managed('m-leaving', { scalingState: 'draining' }),
				managed('m-starting', { scalingState: 'provisioning' }),
				managed('m-failed', { scalingState: 'failed' }),
				managed('m-running'),
				managed('m-running-2'),
			],
		});

		const overview = buildReplicaOverview(service, MAX);

		expect(overview.slots.map(describeSlot)).toEqual([
			'm-running:running',
			'm-running-2:running',
			'm-starting:starting',
			'm-failed:failed',
			'm-leaving:leaving',
			'free',
		]);
		expect(overview.readyCount).toBe(2);
		expect(overview.desiredCount).toBe(3);
		expect(overview.fixedCount).toBe(1);
	});

	it('shows replicas asked for but not created yet as requested slots', () => {
		const service = buildService('orders', {
			scaling: { profile: 'demo_orders', desiredManagedReplicas: 4 },
			instances: [managed('m-1'), managed('m-failed', { scalingState: 'failed' }), managed('m-leaving', { scalingState: 'draining' })],
		});

		const kinds = buildReplicaOverview(service, MAX).slots.map(describeSlot);

		// Failed and draining replicas do not count toward the desired four.
		expect(kinds).toEqual(['m-1:running', 'requested', 'requested', 'requested', 'm-failed:failed', 'm-leaving:leaving']);
	});

	it('never shows negative free room when leaving replicas overflow the max', () => {
		const instances = Array.from({ length: MAX + 1 }, (_, index) => managed(`m-${index}`, { scalingState: 'draining' }));
		const service = buildService('orders', { scaling: { profile: 'demo_orders', desiredManagedReplicas: 0 }, instances });

		const overview = buildReplicaOverview(service, MAX);

		expect(overview.slots).toHaveLength(MAX + 1);
		expect(overview.slots.every((slot) => slot.kind === 'replica')).toBe(true);
		expect(overview.readyCount).toBe(0);
	});
});
