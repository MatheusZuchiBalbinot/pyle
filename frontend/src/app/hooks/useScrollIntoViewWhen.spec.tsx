import { renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useScrollIntoViewWhen } from './useScrollIntoViewWhen';

function buildElementRef(): { ref: ReturnType<typeof createRef<HTMLElement>>; scrollIntoView: ReturnType<typeof vi.fn> } {
	const element = document.createElement('div');
	const scrollIntoView = vi.fn();

	element.scrollIntoView = scrollIntoView;
	const ref = createRef<HTMLElement>();

	ref.current = element;

	return { ref, scrollIntoView };
}

describe('useScrollIntoViewWhen', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('scrolls smoothly on the next frame when given a key', () => {
		const { ref, scrollIntoView } = buildElementRef();

		renderHook(() => useScrollIntoViewWhen(ref, 'acme'));
		expect(scrollIntoView).not.toHaveBeenCalled();
		vi.advanceTimersToNextFrame();

		expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
	});

	it('does nothing without a key', () => {
		const { ref, scrollIntoView } = buildElementRef();

		renderHook(() => useScrollIntoViewWhen(ref, null));
		vi.advanceTimersToNextFrame();

		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('scrolls again when the key changes, not on a re-render with the same key', () => {
		const { ref, scrollIntoView } = buildElementRef();
		const { rerender } = renderHook((key: string | null) => useScrollIntoViewWhen(ref, key), { initialProps: 'a' });

		vi.advanceTimersToNextFrame();

		rerender('a');
		vi.advanceTimersToNextFrame();
		rerender('b');
		vi.advanceTimersToNextFrame();

		expect(scrollIntoView).toHaveBeenCalledTimes(2);
	});

	it('cancels a pending scroll on unmount, and tolerates an unmounted element', () => {
		const { ref, scrollIntoView } = buildElementRef();
		const { unmount } = renderHook(() => useScrollIntoViewWhen(ref, 'a'));

		unmount();
		vi.advanceTimersToNextFrame();
		expect(scrollIntoView).not.toHaveBeenCalled();

		const emptyRef = createRef<HTMLElement>();

		renderHook(() => useScrollIntoViewWhen(emptyRef, 'a'));
		expect(() => vi.advanceTimersToNextFrame()).not.toThrow();
	});
});
