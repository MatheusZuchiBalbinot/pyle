import { describe, expect, it } from 'vitest';

import type { InstanceLiveState } from '../api/adminApiTypes';
import { INSTANCE_BADGE_TONE, isInstanceInTrouble, resolveInstanceBadge, statusClassOf, type InstanceBadgeState } from './gatewayLabels';

function live(health: InstanceLiveState['health'], circuit: InstanceLiveState['circuit']): InstanceLiveState {
	return {
		instanceId: 'i',
		gatewayId: 'g',
		health,
		circuit,
		inFlight: 0,
		consecutiveFailures: 0,
		lastCheckAt: null,
		lastCheckLatencyMs: null,
		updatedAt: '',
	};
}

describe('resolveInstanceBadge', () => {
	it.each<[string, boolean, InstanceLiveState | null, InstanceBadgeState]>([
		['open circuit beats everything', true, live('unhealthy', 'open'), 'circuit_open'],
		['open circuit even when drained', false, live('healthy', 'open'), 'circuit_open'],
		['failing health checks', true, live('unhealthy', 'closed'), 'unhealthy'],
		['unhealthy beats half open', true, live('unhealthy', 'half_open'), 'unhealthy'],
		['probing circuit', true, live('healthy', 'half_open'), 'half_open'],
		['drained by an operator', false, live('healthy', 'closed'), 'drained'],
		['drained and never reported', false, null, 'drained'],
		['healthy', true, live('healthy', 'closed'), 'healthy'],
		['not checked yet', true, live('unknown', 'closed'), 'unknown'],
		['no gateway reported it', true, null, 'unknown'],
	])('%s', (_name, isEnabled, liveState, expected) => {
		expect(resolveInstanceBadge({ isEnabled, live: liveState, scalingState: null })).toBe(expected);
		expect(INSTANCE_BADGE_TONE[expected]).toBeDefined();
	});
});

describe('managed replicas coming and going', () => {
	it('shows starting and leaving before anything the gateways report', () => {
		expect(resolveInstanceBadge({ isEnabled: false, live: null, scalingState: 'provisioning' })).toBe('starting');
		expect(resolveInstanceBadge({ isEnabled: false, live: live('unhealthy', 'open'), scalingState: 'draining' })).toBe('leaving');
		expect(resolveInstanceBadge({ isEnabled: true, live: live('healthy', 'closed'), scalingState: 'running' })).toBe('healthy');
		expect(isInstanceInTrouble({ isEnabled: false, live: null, scalingState: 'provisioning' })).toBe(false);
	});
});

describe('isInstanceInTrouble', () => {
	it('flags only enabled instances out of rotation', () => {
		expect(isInstanceInTrouble({ isEnabled: true, live: live('unhealthy', 'closed'), scalingState: null })).toBe(true);
		expect(isInstanceInTrouble({ isEnabled: true, live: live('healthy', 'open'), scalingState: null })).toBe(true);
		expect(isInstanceInTrouble({ isEnabled: false, live: live('unhealthy', 'closed'), scalingState: null })).toBe(false);
		expect(isInstanceInTrouble({ isEnabled: true, live: live('healthy', 'half_open'), scalingState: null })).toBe(false);
		expect(isInstanceInTrouble({ isEnabled: true, live: null, scalingState: null })).toBe(false);
	});
});

describe('statusClassOf', () => {
	it('groups statuses, and knows nothing of the rest', () => {
		expect(statusClassOf(204)).toBe('2xx');
		expect(statusClassOf(302)).toBe('3xx');
		expect(statusClassOf(499)).toBe('4xx');
		expect(statusClassOf(503)).toBe('5xx');
		expect(statusClassOf(101)).toBeNull();
	});
});
