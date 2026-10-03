import type { ReactNode } from 'react';

import type { RealtimeEvent } from '../app/api/realtimeEvents';
import {
	RealtimeContext,
	type RealtimeConnectionState,
	type RealtimeContextValue,
	type RealtimeEventHandler,
	type TrafficCollection,
} from '../app/core/realtime/realtimeContext';
import { buildQueryHarness } from './queryHarness';

export type RealtimeHarness = {
	readonly wrapper: ({ children }: { children: ReactNode }) => ReactNode;
	readonly emit: (event: RealtimeEvent) => void;
	readonly subscriberCount: () => number;
	// Every event that passed through, including the ones a hook emitted
	// locally after its own mutation.
	readonly events: () => readonly RealtimeEvent[];
};

type RealtimeHarnessOptions = {
	readonly connectionState?: RealtimeConnectionState;
	readonly lastTrafficCollection?: TrafficCollection | null;
};

export function buildRealtimeHarness(options: RealtimeHarnessOptions = {}): RealtimeHarness {
	const handlers = new Set<RealtimeEventHandler>();

	function subscribe(handler: RealtimeEventHandler): () => void {
		handlers.add(handler);

		return () => {
			handlers.delete(handler);
		};
	}

	const seenEvents: RealtimeEvent[] = [];

	function emit(event: RealtimeEvent): void {
		seenEvents.push(event);
		// Snapshot first: a handler is allowed to unsubscribe while the
		// event is being delivered, exactly as it can in the real provider.
		const currentHandlers = Array.from(handlers);

		for (const handler of currentHandlers) {
			handler(event);
		}
	}

	const value: RealtimeContextValue = {
		connectionState: options.connectionState ?? 'connected',
		subscribe,
		emitLocalEvent: emit,
		lastTrafficCollection: options.lastTrafficCollection ?? null,
	};

	const query = buildQueryHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return query.wrapper({ children: <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider> });
	}

	return { wrapper, emit, subscriberCount: () => handlers.size, events: () => seenEvents };
}
