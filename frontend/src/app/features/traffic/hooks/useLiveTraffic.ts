import type { QueryKey } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import { useOptionalRealtimeSubscribe, useRealtime } from '@/app/core/realtime/useRealtime';
import { useAsyncResource, type UseAsyncResourceResult } from '@/app/hooks/useAsyncResource';

import type { LiveDataStatus } from '../components/LiveChartNote/liveDataStatus';

// A busy gateway flushes every 10 s per gateway; charts do not need to
// redraw more often than this.
export const LIVE_TRAFFIC_REFETCH_THROTTLE_MS = 5000;
// A collection older than this many intervals means the data stopped.
const STALE_AFTER_INTERVALS = 3;
const STATUS_CLOCK_MS = 5000;

export type UseLiveTrafficOptions = {
	readonly queryKey: QueryKey;
	readonly fallbackErrorMessage: string;
	// Other events that change this data, refetched right away (not
	// throttled): an instance state change, a new alert.
	readonly refetchOn?: (event: RealtimeEvent) => boolean;
};

// Refetches on traffic.collected, at most every 5 s, keeping the previous data on screen
// (no skeleton on refresh).
export function useLiveTraffic<T>(load: () => Promise<T>, options: UseLiveTrafficOptions): UseAsyncResourceResult<T> {
	const resource = useAsyncResource(load, options);
	const { refetch } = resource;
	const lastRefetchAtRef = useRef(0);
	const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const refetchThrottled = useCallback(() => {
		if (trailingTimerRef.current !== null) {
			return;
		}

		const waitMs = lastRefetchAtRef.current + LIVE_TRAFFIC_REFETCH_THROTTLE_MS - Date.now();

		const run = (): void => {
			trailingTimerRef.current = null;
			lastRefetchAtRef.current = Date.now();
			void refetch();
		};

		if (waitMs <= 0) {
			return run();
		}

		trailingTimerRef.current = setTimeout(run, waitMs);
	}, [refetch]);

	const handleEvent = useCallback(
		(event: RealtimeEvent) => {
			if (event.type === 'traffic.collected') {
				refetchThrottled();
			}
		},
		[refetchThrottled],
	);

	useOptionalRealtimeSubscribe(handleEvent);

	useEffect(
		() => () => {
			if (trailingTimerRef.current !== null) {
				clearTimeout(trailingTimerRef.current);
			}
		},
		[],
	);

	return resource;
}

export function useLiveDataStatus(): LiveDataStatus {
	const { connectionState, lastTrafficCollection } = useRealtime();
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const intervalId = setInterval(() => setNow(Date.now()), STATUS_CLOCK_MS);

		return () => clearInterval(intervalId);
	}, []);
	const collectedAt = lastTrafficCollection?.collectedAt ?? null;
	const intervalMs = lastTrafficCollection?.intervalMs ?? 0;
	const state = resolveLiveState({ isConnected: connectionState === 'connected', collectedAt, intervalMs, now });

	return { state, lastCollectedAt: collectedAt };
}

function resolveLiveState(input: {
	readonly isConnected: boolean;
	readonly collectedAt: number | null;
	readonly intervalMs: number;
	readonly now: number;
}): LiveDataStatus['state'] {
	if (!input.isConnected) {
		return 'offline';
	}

	if (input.collectedAt === null) {
		return 'waiting';
	}

	const isOverdue = input.now - input.collectedAt > input.intervalMs * STALE_AFTER_INTERVALS;

	return isOverdue ? 'stale' : 'live';
}
