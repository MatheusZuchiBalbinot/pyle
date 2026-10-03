import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { LIVE_TRAFFIC_REFETCH_THROTTLE_MS, useLiveDataStatus, useLiveTraffic } from './useLiveTraffic';

const COLLECTED = stampLocalEvent({ type: 'traffic.collected', bucketStart: '2026-09-26T12:00:00.000Z', routeIds: ['r1'], bucketMs: 10_000 });
const STATE_CHANGE = stampLocalEvent({
	type: 'instance.state.changed',
	serviceId: 's1',
	serviceSlug: 'orders',
	instanceId: 'i1',
	instanceName: 'orders-1',
	kind: 'health',
	toState: 'unhealthy',
	reason: 'x',
});

describe('useLiveTraffic', () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('refetches on new traffic at most once every 5 s, with a trailing refetch', async () => {
		const load = vi.fn().mockResolvedValue({ requestCount: 1 });
		const harness = buildRealtimeHarness();
		const { result, unmount } = renderHook(() => useLiveTraffic(load, { queryKey: ['live'], fallbackErrorMessage: 'x' }), {
			wrapper: harness.wrapper,
		});

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		act(() => harness.emit(COLLECTED));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		act(() => {
			harness.emit(COLLECTED);
			harness.emit(COLLECTED);
		});
		expect(load).toHaveBeenCalledTimes(2);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(LIVE_TRAFFIC_REFETCH_THROTTLE_MS);
		});

		expect(load).toHaveBeenCalledTimes(3);
		unmount();
	});

	it('refetches other events at once, and forgets its timer on unmount', async () => {
		const load = vi.fn().mockResolvedValue({});
		const harness = buildRealtimeHarness();
		const options = {
			queryKey: ['live'],
			fallbackErrorMessage: 'x',
			refetchOn: (event: { readonly type: string }) => event.type === 'instance.state.changed',
		};
		const { unmount } = renderHook(() => useLiveTraffic(load, options), { wrapper: harness.wrapper });

		await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

		act(() => harness.emit(STATE_CHANGE));
		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		act(() => harness.emit(COLLECTED));
		act(() => harness.emit(COLLECTED));
		unmount();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(LIVE_TRAFFIC_REFETCH_THROTTLE_MS * 2);
		});

		expect(load.mock.calls.length).toBeLessThanOrEqual(3);
	});
});

describe('useLiveDataStatus', () => {
	it('is offline without a connection, waiting before the first bucket, live, then stale', () => {
		expect(
			renderHook(() => useLiveDataStatus(), { wrapper: buildRealtimeHarness({ connectionState: 'reconnecting' }).wrapper }).result.current.state,
		).toBe('offline');
		expect(renderHook(() => useLiveDataStatus(), { wrapper: buildRealtimeHarness().wrapper }).result.current).toEqual({
			state: 'waiting',
			lastCollectedAt: null,
		});

		const fresh = buildRealtimeHarness({ lastTrafficCollection: { collectedAt: Date.now(), intervalMs: 10_000 } });

		expect(renderHook(() => useLiveDataStatus(), { wrapper: fresh.wrapper }).result.current.state).toBe('live');
		const old = buildRealtimeHarness({ lastTrafficCollection: { collectedAt: Date.now() - 60_000, intervalMs: 10_000 } });

		expect(renderHook(() => useLiveDataStatus(), { wrapper: old.wrapper }).result.current.state).toBe('stale');
	});
});
