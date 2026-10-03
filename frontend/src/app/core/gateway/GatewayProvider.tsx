import { useCallback, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

import type { PageId } from '@/app/shell/Sidebar/navItems';

import { locationOfPage, locationOfSelection, type ConsoleLocation } from './consoleLocation';
import { GatewayContext, type ConsoleSelection, type GatewayContextValue, type ToastAction, type ToastTone } from './gatewayContext';
import { useConsoleLocation } from './useConsoleLocation';

// Confirmations go quickly; a failure stays long enough to be read (a click dismisses any).
const TOAST_AUTO_DISMISS_MS_BY_TONE: Readonly<Record<ToastTone, number>> = {
	default: 3600,
	success: 3600,
	info: 3600,
	warning: 10_000,
	danger: 10_000,
};

// Long enough to reach the button, short enough that undoing stays a reflex.
const ACTION_TOAST_AUTO_DISMISS_MS = 5000;

let toastSeq = 0;

export function GatewayProvider({ children }: { readonly children: ReactNode }): ReactElement {
	const [isNavOpen, setIsNavOpen] = useState(false);
	const { location, goTo } = useConsoleLocation();
	// Where each page was left, so the sidebar returns to it (a filtered route, an open
	// instance) the way it did before the URL held it.
	const lastLocationByPageRef = useRef(new Map<PageId, ConsoleLocation>());
	const [toasts, setToasts] = useState<GatewayContextValue['toasts']>([]);

	// Tracked so a dismiss cancels its own timer and unmounting cancels all of them.
	const dismissTimersRef = useRef(new Map<number, number>());

	const removeToast = useCallback((id: number) => {
		setToasts((current) => current.filter((item) => item.id !== id));
	}, []);

	const dismissToast = useCallback(
		(id: number) => {
			const timerId = dismissTimersRef.current.get(id);

			if (timerId !== undefined) {
				window.clearTimeout(timerId);
			}

			dismissTimersRef.current.delete(id);
			removeToast(id);
		},
		[removeToast],
	);

	const toast = useCallback(
		(message: string, tone: ToastTone = 'default', action?: ToastAction) => {
			const id = ++toastSeq;
			const toastAction = action ?? null;
			const autoDismissMs = toastAction === null ? TOAST_AUTO_DISMISS_MS_BY_TONE[tone] : ACTION_TOAST_AUTO_DISMISS_MS;

			setToasts((current) => [...current, { id, message, tone, action: toastAction }]);
			const timerId = window.setTimeout(() => dismissToast(id), autoDismissMs);

			dismissTimersRef.current.set(id, timerId);
		},
		[dismissToast],
	);

	useEffect(() => {
		const timers = dismissTimersRef.current;

		return () => {
			for (const timerId of timers.values()) {
				window.clearTimeout(timerId);
			}

			timers.clear();
		};
	}, []);

	// Every way of arriving counts: a click, the URL on load, the back button.
	useEffect(() => {
		lastLocationByPageRef.current.set(location.page, location);
	}, [location]);

	const moveTo = useCallback(
		(next: ConsoleLocation) => {
			goTo(next, 'push');
			setIsNavOpen(false);
		},
		[goTo],
	);

	// The current page's own entry goes back to the page itself: a second click on it in the
	// sidebar closes whatever was open.
	const navigate = useCallback(
		(page: PageId) => {
			const remembered = lastLocationByPageRef.current.get(page);
			const shouldOpenPageItself = page === location.page || remembered === undefined;

			moveTo(shouldOpenPageItself ? locationOfPage(page) : remembered);
		},
		[location.page, moveTo],
	);

	const openSelection = useCallback((next: ConsoleSelection) => moveTo(locationOfSelection(next)), [moveTo]);

	const clearSelection = useCallback(() => moveTo(locationOfPage(location.page)), [location.page, moveTo]);

	const openAnalysis = useCallback((analysisId: string) => openSelection({ type: 'analysis', analysisId }), [openSelection]);

	const contextValue: GatewayContextValue = {
		isNavOpen,
		setIsNavOpen,
		toasts,
		toast,
		dismissToast,
		activePage: location.page,
		navigate,
		selection: location.selection,
		openSelection,
		clearSelection,
		openAnalysis,
	};

	// No useMemo: almost every field changes on its own anyway.
	return <GatewayContext.Provider value={contextValue}>{children}</GatewayContext.Provider>;
}
