import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import { buildConsoleHarness } from '@/test/consoleHarness';

import { useRealtimeReactions } from './useRealtimeReactions';

const AT = '2026-09-25T10:00:00.000Z';

const INSTANCE_DOWN: RealtimeEvent = {
	type: 'instance.state.changed',
	serviceId: 's1',
	serviceSlug: 'orders',
	instanceId: 'i2',
	instanceName: 'orders-2',
	kind: 'health',
	toState: 'unhealthy',
	reason: '3 consecutive failed health checks',
	occurredAt: AT,
};

function renderReactions() {
	const harness = buildConsoleHarness();

	renderHook(() => useRealtimeReactions(), { wrapper: harness.wrapper });

	return harness;
}

function emit(harness: ReturnType<typeof renderReactions>, event: RealtimeEvent): void {
	act(() => {
		harness.emit(event);
	});
}

describe('useRealtimeReactions', () => {
	it('toasts a fact worth interrupting for, with the matching tone', () => {
		const harness = renderReactions();

		emit(harness, INSTANCE_DOWN);

		expect(harness.toasts()).toEqual([{ message: 'realtimeEvents.instanceState.unhealthy', tone: 'danger' }]);
	});

	it('stays quiet for a traffic tick, which only the charts care about', () => {
		const harness = renderReactions();

		emit(harness, { type: 'traffic.collected', bucketStart: AT, routeIds: ['r1'], bucketMs: 10_000, occurredAt: AT });

		expect(harness.toasts()).toEqual([]);
	});

	it('stays quiet for a recovery, which the inbox records', () => {
		const harness = renderReactions();

		emit(harness, { ...INSTANCE_DOWN, toState: 'healthy' });

		expect(harness.toasts()).toEqual([]);
	});

	it('stops reacting once unmounted', () => {
		const harness = buildConsoleHarness();
		const { unmount } = renderHook(() => useRealtimeReactions(), { wrapper: harness.wrapper });

		unmount();
		act(() => {
			harness.emit(INSTANCE_DOWN);
		});

		expect(harness.toasts()).toEqual([]);
	});
});
