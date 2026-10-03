import { createContext } from 'react';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';

export type RealtimeConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export type RealtimeEventHandler = (event: RealtimeEvent) => void;

export type TrafficCollection = {
	readonly collectedAt: number;
	readonly intervalMs: number;
};

export type RealtimeContextValue = {
	readonly connectionState: RealtimeConnectionState;
	readonly subscribe: (handler: RealtimeEventHandler) => () => void;
	// For the console's own mutations: every view refetches at once, before (or without)
	// the broker's echo.
	readonly emitLocalEvent: (event: RealtimeEvent) => void;
	readonly lastTrafficCollection: TrafficCollection | null;
};

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
