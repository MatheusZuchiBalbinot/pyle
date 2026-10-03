import { useCallback, useState } from 'react';

import type { TrafficWindowName } from '@/app/api/adminApiTypes';
import type { PageId } from '@/app/shell/Sidebar/navItems';

export type TrafficWindowState = {
	readonly window: TrafficWindowName;
	readonly setWindow: (value: TrafficWindowName) => void;
};

export const TRAFFIC_WINDOW_NAMES: readonly TrafficWindowName[] = ['15m', '1h', '6h', '24h'];
const STORAGE_KEY_PREFIX = 'pyle:traffic-window:';

export function useTrafficWindow(pageId: PageId, fallback: TrafficWindowName): TrafficWindowState {
	const [current, setCurrent] = useState<TrafficWindowName>(() => readStoredTrafficWindow(pageId, fallback));
	const setWindow = useCallback(
		(value: TrafficWindowName) => {
			setCurrent(value);
			storeWindow(pageId, value);
		},
		[pageId],
	);

	return { window: current, setWindow };
}

// Storage can be missing or throw (private mode, blocked site data): the
// choice is a convenience, never a reason to break the page.
export function readStoredTrafficWindow(pageId: PageId, fallback: TrafficWindowName): TrafficWindowName {
	try {
		const stored = window.localStorage.getItem(`${STORAGE_KEY_PREFIX}${pageId}`);

		return isWindowName(stored) ? stored : fallback;
	} catch {
		return fallback;
	}
}

function isWindowName(value: string | null): value is TrafficWindowName {
	return value !== null && (TRAFFIC_WINDOW_NAMES as readonly string[]).includes(value);
}

function storeWindow(pageId: PageId, value: TrafficWindowName): void {
	try {
		window.localStorage.setItem(`${STORAGE_KEY_PREFIX}${pageId}`, value);
	} catch {
		// Best effort: the choice just will not survive a reload.
	}
}
