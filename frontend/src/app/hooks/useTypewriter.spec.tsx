import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TYPEWRITER_MAX_DURATION_MS, typingSpeed, useTypewriter } from './useTypewriter';

describe('typingSpeed', () => {
	it('types a short reply at reading pace and speeds up a long one to fit the cap', () => {
		expect(typingSpeed(10)).toBe(0.12);
		expect(typingSpeed(5000)).toBe(5000 / TYPEWRITER_MAX_DURATION_MS);
	});
});

describe('useTypewriter', () => {
	let now = 0;
	let callbacks: Array<(time: number) => void> = [];

	function flushFrame(advanceMs: number): void {
		now += advanceMs;
		const pending = callbacks;

		callbacks = [];
		act(() => {
			for (const callback of pending) {
				callback(now);
			}
		});
	}

	beforeEach(() => {
		now = 0;
		callbacks = [];
		vi.stubGlobal('requestAnimationFrame', (callback: (time: number) => void) => callbacks.push(callback));
		vi.stubGlobal('cancelAnimationFrame', () => {
			callbacks = [];
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('reveals the text progressively, then reports it is done', () => {
		const text = 'Olá, operador!';
		const { result } = renderHook(() => useTypewriter(text, true));

		expect(result.current).toEqual({ visibleText: '', isTyping: true });

		flushFrame(0);
		flushFrame(50);
		expect(result.current.visibleText).toBe('Olá, o');
		expect(result.current.isTyping).toBe(true);

		flushFrame(1000);
		expect(result.current).toEqual({ visibleText: text, isTyping: false });
		expect(callbacks).toHaveLength(0);
	});

	it('shows text that should not animate at once', () => {
		const { result } = renderHook(() => useTypewriter('pronto', false));

		expect(result.current).toEqual({ visibleText: 'pronto', isTyping: false });
		expect(callbacks).toHaveLength(0);
	});

	it('jumps to the end under prefers-reduced-motion', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		const { result } = renderHook(() => useTypewriter('texto longo', true));

		flushFrame(0);

		expect(result.current).toEqual({ visibleText: 'texto longo', isTyping: false });
	});

	it('stops typing on unmount', () => {
		const { unmount } = renderHook(() => useTypewriter('abc', true));

		unmount();

		expect(callbacks).toHaveLength(0);
	});
});
