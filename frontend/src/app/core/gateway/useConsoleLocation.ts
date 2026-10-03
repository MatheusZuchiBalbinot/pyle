import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import { parseConsolePath, toConsolePath, type ConsoleLocation } from './consoleLocation';

// push: a new entry the back button returns from. replace: the same entry, corrected.
export type HistoryMode = 'push' | 'replace';

export type ConsoleLocationState = {
	readonly location: ConsoleLocation;
	readonly goTo: (next: ConsoleLocation, mode: HistoryMode) => void;
};

// The console's location, kept in step with the browser's: read from the URL on load, written
// to it on every move, and read back when the user goes back or forward.
export function useConsoleLocation(): ConsoleLocationState {
	const [location, setLocation] = useState<ConsoleLocation>(readBrowserLocation);
	const pageRef = useRef(location.page);

	// Only a change of page animates; opening a row on the same page is not a transition.
	const showLocation = useCallback((next: ConsoleLocation) => {
		const isPageChange = next.page !== pageRef.current;

		pageRef.current = next.page;

		if (!isPageChange || !canAnimatePageChange()) {
			return setLocation(next);
		}

		document.startViewTransition(() => flushSync(() => setLocation(next)));
	}, []);

	useEffect(() => {
		// An unknown or partial path is rewritten to what the console actually shows.
		writeBrowserPath(toConsolePath(readBrowserLocation()), 'replace');

		function handlePopState(): void {
			showLocation(readBrowserLocation());
		}

		window.addEventListener('popstate', handlePopState);

		return () => window.removeEventListener('popstate', handlePopState);
	}, [showLocation]);

	const goTo = useCallback(
		(next: ConsoleLocation, mode: HistoryMode) => {
			showLocation(next);
			writeBrowserPath(toConsolePath(next), mode);
		},
		[showLocation],
	);

	return { location, goTo };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function canAnimatePageChange(): boolean {
	const isSupported = typeof document.startViewTransition === 'function';

	return isSupported && !window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function readBrowserLocation(): ConsoleLocation {
	return parseConsolePath(window.location.pathname);
}

function writeBrowserPath(path: string, mode: HistoryMode): void {
	if (path === window.location.pathname) {
		return;
	}

	if (mode === 'push') {
		window.history.pushState(null, '', path);

		return;
	}

	window.history.replaceState(null, '', path);
}
