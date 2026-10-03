import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { Service } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { buildInstance, buildLiveState, buildService, NO_CHAOS } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { appendTimelineEntry, MAX_TIMELINE_ENTRIES, useServiceLiveState } from './useServiceLiveState';

const ORDERS = buildService('orders', {
	instances: [buildInstance('orders-1', { live: buildLiveState({ instanceId: 'id-orders-1' }) }), buildInstance('orders-2', { live: null })],
});

function stateChange(instanceId: string, kind: 'health' | 'circuit', toState: 'unhealthy' | 'circuit_open' | 'healthy') {
	return stampLocalEvent({
		type: 'instance.state.changed',
		serviceId: 's',
		serviceSlug: 'orders',
		instanceId,
		instanceName: 'x',
		kind,
		toState,
		reason: 'why',
	});
}

function render(initial: readonly Service[] | null = [ORDERS]) {
	const realtime = buildRealtimeHarness();
	const hook = renderHook(({ services }) => useServiceLiveState(services), { wrapper: realtime.wrapper, initialProps: { services: initial } });

	return { ...hook, realtime };
}

describe('useServiceLiveState', () => {
	it('applies a state change to that instance only, at once', () => {
		const { result, realtime } = render();

		act(() => realtime.emit(stateChange('id-orders-1', 'health', 'unhealthy')));
		act(() => realtime.emit(stateChange('id-orders-2', 'circuit', 'circuit_open')));

		const [first, second] = result.current.services?.[0].instances ?? [];

		expect(first.live).toMatchObject({ health: 'unhealthy', circuit: 'closed' });
		expect(second.live).toMatchObject({ health: 'unknown', circuit: 'open' });
		expect(result.current.timelineOf('id-orders-1')).toEqual([expect.objectContaining({ kind: 'health', toState: 'unhealthy', reason: 'why' })]);
	});

	it('applies chaos and ignores unrelated events', () => {
		const { result, realtime } = render();
		const chaos = { ...NO_CHAOS, isDown: true };

		act(() =>
			realtime.emit(stampLocalEvent({ type: 'chaos.changed', instanceId: 'id-orders-2', instanceName: 'orders-2', serviceSlug: 'orders', chaos })),
		);
		act(() => realtime.emit(stampLocalEvent({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'up' })));

		expect(result.current.services?.[0].instances[1].chaos).toEqual(chaos);
		expect(result.current.timelineOf('id-orders-2')).toEqual([]);
	});

	it('drops overrides when fresh data arrives, keeps the timeline, and waits for data', () => {
		const { result, realtime, rerender } = render();

		act(() => realtime.emit(stateChange('id-orders-1', 'health', 'unhealthy')));

		rerender({ services: [{ ...ORDERS }] });

		expect(result.current.services?.[0].instances[0].live?.health).toBe('healthy');
		expect(result.current.timelineOf('id-orders-1')).toHaveLength(1);
		rerender({ services: null });
		expect(result.current.services).toBeNull();
	});

	it('keeps at most 20 timeline entries per instance, newest first', () => {
		let timeline: ReturnType<typeof appendTimelineEntry> = new Map();

		for (let index = 0; index < MAX_TIMELINE_ENTRIES + 5; index++) {
			timeline = appendTimelineEntry(timeline, 'i', { kind: 'health', toState: 'healthy', reason: String(index), occurredAt: '' });
		}

		expect(timeline.get('i')).toHaveLength(MAX_TIMELINE_ENTRIES);
		expect(timeline.get('i')?.[0].reason).toBe('24');
	});
});
