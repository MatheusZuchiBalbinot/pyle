import { act, renderHook } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDismissableMenu } from './useDismissableMenu';

function buildContainer(): { ref: ReturnType<typeof createRef<HTMLElement>>; container: HTMLElement; inside: HTMLElement; outside: HTMLElement } {
	const container = document.createElement('div');
	const inside = document.createElement('button');

	container.append(inside);
	const outside = document.createElement('div');

	document.body.append(container, outside);
	const ref = createRef<HTMLElement>();

	ref.current = container;

	return { ref, container, inside, outside };
}

function mouseDownOn(target: EventTarget): void {
	act(() => {
		target.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
	});
}

function pressEscape(): void {
	act(() => {
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
	});
}

describe('useDismissableMenu', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('closes on a click outside', () => {
		const { ref, outside } = buildContainer();
		const onDismiss = vi.fn();

		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		mouseDownOn(outside);

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('stays open for a click on something inside it', () => {
		const { ref, inside } = buildContainer();
		const onDismiss = vi.fn();

		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		mouseDownOn(inside);

		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('closes on Escape', () => {
		const { ref } = buildContainer();
		const onDismiss = vi.fn();

		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		pressEscape();

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('ignores any other key', () => {
		const { ref } = buildContainer();
		const onDismiss = vi.fn();

		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		act(() => {
			document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
		});

		expect(onDismiss).not.toHaveBeenCalled();
	});

	// Listeners only exist while the menu is open, so a closed menu costs
	// nothing and cannot fire.
	it('listens to nothing while the menu is closed', () => {
		const { ref, outside } = buildContainer();
		const onDismiss = vi.fn();

		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: false, onDismiss }));

		mouseDownOn(outside);
		pressEscape();

		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('treats a click as outside when the container is not mounted yet', () => {
		const onDismiss = vi.fn();
		const ref = createRef<HTMLElement>();
		const outside = document.createElement('div');

		document.body.append(outside);
		renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		mouseDownOn(outside);

		expect(onDismiss).toHaveBeenCalledOnce();
	});

	it('stops listening once the menu closes', () => {
		const { ref, outside } = buildContainer();
		const onDismiss = vi.fn();
		const { rerender } = renderHook((isOpen: boolean) => useDismissableMenu({ containerRef: ref, isOpen, onDismiss }), { initialProps: true });

		rerender(false);
		mouseDownOn(outside);

		expect(onDismiss).not.toHaveBeenCalled();
	});

	it('stops listening on unmount', () => {
		const { ref, outside } = buildContainer();
		const onDismiss = vi.fn();
		const { unmount } = renderHook(() => useDismissableMenu({ containerRef: ref, isOpen: true, onDismiss }));

		unmount();
		mouseDownOn(outside);

		expect(onDismiss).not.toHaveBeenCalled();
	});
});
