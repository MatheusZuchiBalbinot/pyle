import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useActiveTooltip } from './useActiveTooltip';

function addAnchor(tooltip: string | null, attributes: Readonly<Record<string, string>> = {}): HTMLElement {
	const anchor = document.createElement('button');

	if (tooltip !== null) {
		anchor.dataset.tooltip = tooltip;
	}

	for (const [name, value] of Object.entries(attributes)) {
		anchor.setAttribute(name, value);
	}

	document.body.append(anchor);

	return anchor;
}

function hoverOver(target: EventTarget): void {
	act(() => {
		target.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
	});
}

function leave(target: EventTarget, relatedTarget: EventTarget | null = null): void {
	act(() => {
		target.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget }));
	});
}

function focus(target: EventTarget): void {
	act(() => {
		target.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
	});
}

describe('useActiveTooltip', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('shows nothing until something is hovered', () => {
		const { result } = renderHook(() => useActiveTooltip());

		expect(result.current).toBeNull();
	});

	it('shows the text of the hovered anchor, below it by default', () => {
		const anchor = addAnchor('Criar rota');
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		expect(result.current).toEqual(expect.objectContaining({ text: 'Criar rota', side: 'bottom' }));
	});

	it('honours an anchor that asks for the tooltip above it', () => {
		const anchor = addAnchor('Criar rota', { 'data-tooltip-side': 'top' });
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		expect(result.current?.side).toBe('top');
	});

	it('finds the anchor when the hover landed on a child, such as the icon inside a button', () => {
		const anchor = addAnchor('Criar rota');
		const icon = document.createElement('span');

		anchor.append(icon);
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(icon);

		expect(result.current?.text).toBe('Criar rota');
	});

	it('shows nothing for an element with no tooltip of its own', () => {
		const plain = document.createElement('div');

		document.body.append(plain);
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(plain);

		expect(result.current).toBeNull();
	});

	it('shows nothing for an anchor whose tooltip text is empty', () => {
		const anchor = addAnchor('');
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		expect(result.current).toBeNull();
	});

	// The open menu sits exactly where the tooltip would, and it is the
	// more useful thing to see.
	it('stays out of the way of an open dropdown', () => {
		const anchor = addAnchor('Notificações', { 'aria-expanded': 'true' });
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		expect(result.current).toBeNull();
	});

	it('hides when the pointer leaves the anchor', () => {
		const anchor = addAnchor('Criar rota');
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		leave(anchor);

		expect(result.current).toBeNull();
	});

	it('keeps the tooltip while the pointer only moves onto a child of the anchor', () => {
		const anchor = addAnchor('Criar rota');
		const icon = document.createElement('span');

		anchor.append(icon);
		const { result } = renderHook(() => useActiveTooltip());

		hoverOver(anchor);

		leave(anchor, icon);

		expect(result.current?.text).toBe('Criar rota');
	});

	it('ignores a pointer leaving when nothing was showing', () => {
		const anchor = addAnchor('Criar rota');
		const { result } = renderHook(() => useActiveTooltip());

		leave(anchor);

		expect(result.current).toBeNull();
	});

	describe('keyboard versus pointer focus', () => {
		it('shows the tooltip of an element reached with the keyboard', () => {
			const anchor = addAnchor('Criar rota');
			const { result } = renderHook(() => useActiveTooltip());

			focus(anchor);

			expect(result.current?.text).toBe('Criar rota');
		});

		it('stays quiet for focus that came from a click, which already opened something', () => {
			const anchor = addAnchor('Criar rota');
			const { result } = renderHook(() => useActiveTooltip());

			act(() => {
				document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			});
			focus(anchor);

			expect(result.current).toBeNull();
		});

		it('shows tooltips again once the user goes back to the keyboard', () => {
			const anchor = addAnchor('Criar rota');
			const { result } = renderHook(() => useActiveTooltip());

			act(() => {
				document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
			});

			act(() => {
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
			});
			focus(anchor);

			expect(result.current?.text).toBe('Criar rota');
		});
	});

	describe('dismissal', () => {
		it.each([
			['a keypress', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))],
			['a click', () => document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))],
			['a scroll', () => document.dispatchEvent(new Event('scroll'))],
			['a resize', () => window.dispatchEvent(new Event('resize'))],
			['focus leaving', () => document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))],
		])('drops the tooltip on %s, because the anchor is about to move', (_name, dismiss) => {
			const anchor = addAnchor('Criar rota');
			const { result } = renderHook(() => useActiveTooltip());

			hoverOver(anchor);

			act(() => {
				dismiss();
			});

			expect(result.current).toBeNull();
		});
	});

	it('stops listening on unmount, so a later hover cannot resurrect it', () => {
		const anchor = addAnchor('Criar rota');
		const { result, unmount } = renderHook(() => useActiveTooltip());

		unmount();
		hoverOver(anchor);

		expect(result.current).toBeNull();
	});
});
