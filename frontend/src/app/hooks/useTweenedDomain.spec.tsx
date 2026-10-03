import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DOMAIN_TWEEN_MS, easeOutCubic, interpolateDomain, useTweenedDomain, type ChartDomain } from './useTweenedDomain';

const FROM: ChartDomain = { minAt: 0, maxAt: 100, maxValue: 10 };
const TO: ChartDomain = { minAt: 20, maxAt: 120, maxValue: 20 };

describe('interpolateDomain', () => {
	it('starts at the old domain, ends at the new one, eases in between', () => {
		expect(interpolateDomain(FROM, TO, 0)).toEqual(FROM);
		expect(interpolateDomain(FROM, TO, 1)).toEqual(TO);
		expect(interpolateDomain(FROM, TO, 2)).toEqual(TO);
		expect(interpolateDomain(FROM, TO, 0.5).minAt).toBeCloseTo(20 * easeOutCubic(0.5));
	});
});

describe('useTweenedDomain', () => {
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

	it('shows the first domain as is, then eases to a new one', () => {
		const { result, rerender } = renderHook(({ target, resetKey }) => useTweenedDomain(target, resetKey), {
			initialProps: { target: FROM, resetKey: 'requests' },
		});

		expect(result.current).toEqual(FROM);

		rerender({ target: TO, resetKey: 'requests' });
		flushFrame(0);
		flushFrame(DOMAIN_TWEEN_MS / 2);
		expect(result.current.minAt).toBeGreaterThan(FROM.minAt);
		expect(result.current.minAt).toBeLessThan(TO.minAt);

		flushFrame(DOMAIN_TWEEN_MS);
		expect(result.current).toEqual(TO);
		expect(callbacks).toHaveLength(0);
	});

	it('jumps straight there under prefers-reduced-motion', () => {
		vi.stubGlobal('matchMedia', () => ({ matches: true }));
		const { result, rerender } = renderHook(({ target, resetKey }) => useTweenedDomain(target, resetKey), {
			initialProps: { target: FROM, resetKey: 'requests' },
		});

		rerender({ target: TO, resetKey: 'requests' });
		flushFrame(0);

		expect(result.current).toEqual(TO);
	});

	it('does nothing when the domain did not change', () => {
		const { rerender } = renderHook(({ target, resetKey }) => useTweenedDomain(target, resetKey), {
			initialProps: { target: FROM, resetKey: 'requests' },
		});

		rerender({ target: { ...FROM }, resetKey: 'requests' });

		expect(callbacks).toHaveLength(0);
	});

	it('jumps to the domain of a new key in the same render, then eases live updates again', () => {
		const initialProps = { target: FROM, resetKey: 'requests' };
		const { result, rerender } = renderHook(({ target, resetKey }) => useTweenedDomain(target, resetKey), { initialProps });

		rerender({ target: TO, resetKey: 'latency' });

		expect(result.current).toEqual(TO);
		flushFrame(0);
		expect(result.current).toEqual(TO);

		rerender({ target: FROM, resetKey: 'latency' });
		flushFrame(0);
		flushFrame(DOMAIN_TWEEN_MS / 2);
		expect(result.current.minAt).toBeLessThan(TO.minAt);
		expect(result.current.minAt).toBeGreaterThan(FROM.minAt);
	});
});
