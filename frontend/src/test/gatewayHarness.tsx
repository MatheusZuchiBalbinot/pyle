import { useEffect, useMemo, useState, type ReactNode } from 'react';

import { GatewayContext, type ConsoleSelection, type GatewayContextValue, type ToastAction } from '../app/core/gateway/gatewayContext';
import { buildQueryHarness } from './queryHarness';

// The action only when the toast offered one, so plain toasts compare as { message, tone }.
export type RecordedToast = { readonly message: string; readonly tone: string; readonly action?: ToastAction };

export type GatewayHarness = {
	readonly wrapper: ({ children }: { children: ReactNode }) => ReactNode;
	readonly value: GatewayContextValue;
	readonly toasts: () => readonly RecordedToast[];
	readonly navigations: () => readonly string[];
	readonly selections: () => readonly ConsoleSelection[];
	readonly clearedSelectionCount: () => number;
};

type GatewayHarnessOptions = {
	// What the console has selected when the test starts.
	readonly selection?: ConsoleSelection | null;
};

// Records toasts, navigation and selections for assertions. The selection is live, as in the
// console: opening or clearing one re-renders the hooks under test with it.
export function buildGatewayHarness(options: GatewayHarnessOptions = {}): GatewayHarness {
	let clearedSelections = 0;
	const recordedToasts: RecordedToast[] = [];
	const recordedNavigations: string[] = [];
	const recordedSelections: ConsoleSelection[] = [];
	let setLiveSelection: ((selection: ConsoleSelection | null) => void) | null = null;

	const value = {
		isNavOpen: false,
		setIsNavOpen: () => undefined,
		toasts: [],
		toast: (message: string, tone = 'default', action?: ToastAction) => {
			recordedToasts.push(action === undefined ? { message, tone } : { message, tone, action });
		},
		dismissToast: () => undefined,
		activePage: 'overview',
		navigate: (page: string) => {
			recordedNavigations.push(page);
		},
		selection: options.selection ?? null,
		openSelection: (selection: ConsoleSelection) => {
			recordedSelections.push(selection);
			setLiveSelection?.(selection);
		},
		clearSelection: () => {
			clearedSelections += 1;
			setLiveSelection?.(null);
		},
		openAnalysis: () => undefined,
	} as unknown as GatewayContextValue;

	const query = buildQueryHarness();

	function GatewayStateProvider({ children }: { children: ReactNode }): ReactNode {
		const [selection, setSelection] = useState<ConsoleSelection | null>(options.selection ?? null);
		// The recorded functions stay on `value` (reached through the prototype), so a spy
		// installed on it still sees the calls.
		const liveValue = useMemo(() => Object.assign(Object.create(value) as GatewayContextValue, { selection }), [selection]);

		useEffect(() => {
			setLiveSelection = setSelection;
		}, []);

		return <GatewayContext.Provider value={liveValue}>{children}</GatewayContext.Provider>;
	}

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return query.wrapper({ children: <GatewayStateProvider>{children}</GatewayStateProvider> });
	}

	return {
		wrapper,
		value,
		toasts: () => recordedToasts,
		navigations: () => recordedNavigations,
		selections: () => recordedSelections,
		clearedSelectionCount: () => clearedSelections,
	};
}
