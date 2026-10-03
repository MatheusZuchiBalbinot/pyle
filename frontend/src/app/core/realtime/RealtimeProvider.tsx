import { Centrifuge, type PublicationContext } from 'centrifuge';
import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { mintRealtimeConnection } from '@/app/api/adminApiClient';
import { toRealtimeEvent, type RealtimeConnection, type RealtimeEvent } from '@/app/api/realtimeEvents';

import {
	RealtimeContext,
	type RealtimeConnectionState,
	type RealtimeContextValue,
	type RealtimeEventHandler,
	type TrafficCollection,
} from './realtimeContext';

// Centrifuge calls getToken on connect and before expiry, so a long-lived tab keeps its
// subscription without our own timers.
async function fetchConnectionToken(): Promise<string> {
	const connection = await mintRealtimeConnection();

	return connection.token;
}

// This tab's own mutations arrive twice (local echo and broker); the second copy is dropped
// within this window.
const DUPLICATE_EVENT_WINDOW_MS = 3000;

type TrafficCollectedEvent = Extract<RealtimeEvent, { readonly type: 'traffic.collected' }>;

export function RealtimeProvider({ children }: { readonly children: ReactNode }): ReactElement {
	const [connectionState, setConnectionState] = useState<RealtimeConnectionState>('connecting');
	const [lastTrafficCollection, setLastTrafficCollection] = useState<TrafficCollection | null>(null);
	const handlersRef = useRef(new Set<RealtimeEventHandler>());
	const hasConnectedRef = useRef(false);
	const recentEventKeysRef = useRef(new Map<string, number>());

	const dispatch = useCallback((event: RealtimeEvent) => {
		if (event.type === 'traffic.collected') {
			setLastTrafficCollection(toTrafficCollection(event));
		}

		for (const handler of handlersRef.current) {
			handler(event);
		}
	}, []);

	const dispatchOnce = useCallback(
		(event: RealtimeEvent) => {
			const now = Date.now();
			const recent = recentEventKeysRef.current;

			for (const [key, seenAt] of recent) {
				if (now - seenAt > DUPLICATE_EVENT_WINDOW_MS) {
					recent.delete(key);
				}
			}

			const key = toEventKey(event);

			if (recent.has(key)) {
				return;
			}

			recent.set(key, now);
			dispatch(event);
		},
		[dispatch],
	);

	useEffect(() => {
		let isCancelled = false;
		let client: Centrifuge | null = null;

		function handlePublication(context: PublicationContext): void {
			const event = toRealtimeEvent(context.data);

			if (event) {
				dispatchOnce(event);
			}
		}

		function handleConnected(): void {
			hasConnectedRef.current = true;
			setConnectionState('connected');
		}

		function handleConnecting(): void {
			setConnectionState(hasConnectedRef.current ? 'reconnecting' : 'connecting');
		}

		function handleDisconnected(): void {
			setConnectionState('offline');
		}

		function handleConnectionMinted(connection: RealtimeConnection): void {
			if (isCancelled) {
				return;
			}

			client = new Centrifuge(connection.url, { token: connection.token, getToken: fetchConnectionToken });
			client.on('connecting', handleConnecting);
			client.on('connected', handleConnected);
			client.on('disconnected', handleDisconnected);
			client.on('publication', handlePublication);
			client.connect();
		}

		mintRealtimeConnection().then(handleConnectionMinted, handleDisconnected);

		return () => {
			isCancelled = true;
			client?.disconnect();
			client?.removeAllListeners();
		};
	}, [dispatchOnce]);

	const subscribe = useCallback((handler: RealtimeEventHandler) => {
		handlersRef.current.add(handler);

		return () => {
			handlersRef.current.delete(handler);
		};
	}, []);

	const contextValue: RealtimeContextValue = { connectionState, subscribe, emitLocalEvent: dispatchOnce, lastTrafficCollection };

	return <RealtimeContext.Provider value={contextValue}>{children}</RealtimeContext.Provider>;
}

function toEventKey(event: RealtimeEvent): string {
	const { occurredAt: _ignored, ...body } = event;

	return JSON.stringify(body);
}

function toTrafficCollection(event: TrafficCollectedEvent): TrafficCollection {
	return { collectedAt: Date.parse(event.occurredAt), intervalMs: event.bucketMs };
}
