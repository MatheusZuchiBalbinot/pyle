import { useContext, useEffect } from 'react';

import { RealtimeContext, type RealtimeContextValue, type RealtimeEventHandler } from './realtimeContext';

export function useRealtime(): RealtimeContextValue {
	const context = useContext(RealtimeContext);

	if (!context) {
		throw new Error('useRealtime must be used within RealtimeProvider');
	}

	return context;
}

// handler must be stable (useCallback) or the subscription is recreated every render.
export function useRealtimeEvents(handler: RealtimeEventHandler): void {
	const { subscribe } = useRealtime();

	useEffect(() => subscribe(handler), [subscribe, handler]);
}

// Tolerant: a null handler, or no RealtimeProvider around (tests), subscribes nothing.
export function useOptionalRealtimeSubscribe(handler: RealtimeEventHandler | null): void {
	const context = useContext(RealtimeContext);
	const subscribe = context?.subscribe;

	useEffect(() => {
		if (!subscribe || !handler) {
			return;
		}

		return subscribe(handler);
	}, [subscribe, handler]);
}

export function useEmitLocalEvent(): RealtimeContextValue['emitLocalEvent'] {
	return useRealtime().emitLocalEvent;
}
