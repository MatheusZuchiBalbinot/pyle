import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useElementWidth } from './useElementWidth';

type ObserverCallback = (entries: ReadonlyArray<{ contentRect: { width: number } }>) => void;

const observerState = { callback: undefined as ObserverCallback | undefined, observeCount: 0, disconnectCount: 0 };

class FakeResizeObserver {
	constructor(callback: ObserverCallback) {
		observerState.callback = callback;
	}

	observe(): void {
		observerState.observeCount += 1;
	}

	disconnect(): void {
		observerState.disconnectCount += 1;
	}

	unobserve(): void {
		// Not used by the hook.
	}
}

function reportWidth(width: number): void {
	act(() => {
		observerState.callback?.([{ contentRect: { width } }]);
	});
}

describe('useElementWidth', () => {
	beforeEach(() => {
		observerState.callback = undefined;
		observerState.observeCount = 0;
		observerState.disconnectCount = 0;
		vi.stubGlobal('ResizeObserver', FakeResizeObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	// Charts render at 0 until the real width arrives, which is what the
	// SVG needs to avoid computing coordinates against a guess.
	it('reports zero until the element has been measured', () => {
		const ref = createRef<Element>();

		ref.current = document.createElement('div');

		const { result } = renderHook(() => useElementWidth(ref));

		expect(result.current).toBe(0);
		expect(observerState.observeCount).toBe(1);
	});

	it('reports the measured width', () => {
		const ref = createRef<Element>();

		ref.current = document.createElement('div');
		const { result } = renderHook(() => useElementWidth(ref));

		reportWidth(640);

		expect(result.current).toBe(640);
	});

	it('follows the element as the layout changes', () => {
		const ref = createRef<Element>();

		ref.current = document.createElement('div');
		const { result } = renderHook(() => useElementWidth(ref));

		reportWidth(640);

		reportWidth(320);

		expect(result.current).toBe(320);
	});

	it('ignores a notification carrying no entry', () => {
		const ref = createRef<Element>();

		ref.current = document.createElement('div');
		const { result } = renderHook(() => useElementWidth(ref));

		reportWidth(640);

		act(() => {
			observerState.callback?.([]);
		});

		expect(result.current).toBe(640);
	});

	it('observes nothing when there is no element yet', () => {
		const ref = createRef<Element>();

		const { result } = renderHook(() => useElementWidth(ref));

		expect(result.current).toBe(0);
		expect(observerState.observeCount).toBe(0);
	});

	it('disconnects on unmount, so the observer does not outlive the chart', () => {
		const ref = createRef<Element>();

		ref.current = document.createElement('div');
		const { unmount } = renderHook(() => useElementWidth(ref));

		unmount();

		expect(observerState.disconnectCount).toBe(1);
	});
});
