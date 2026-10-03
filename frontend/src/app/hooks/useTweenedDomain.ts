import { useEffect, useRef, useState } from 'react';

export type ChartDomain = {
	readonly minAt: number;
	readonly maxAt: number;
	readonly maxValue: number;
};

export const DOMAIN_TWEEN_MS = 600;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

type Displayed = { readonly key: string; readonly domain: ChartDomain };

export function easeOutCubic(progress: number): number {
	return 1 - (1 - progress) ** 3;
}

export function interpolateDomain(from: ChartDomain, to: ChartDomain, progress: number): ChartDomain {
	const eased = easeOutCubic(Math.min(Math.max(progress, 0), 1));
	const between = (start: number, end: number): number => start + (end - start) * eased;

	return { minAt: between(from.minAt, to.minAt), maxAt: between(from.maxAt, to.maxAt), maxValue: between(from.maxValue, to.maxValue) };
}

// Eased, so a new collection moves the lines instead of swapping the drawing
// in one frame. A new resetKey (another metric, another window) jumps straight
// to the target, in the same render: easing between unrelated scales would
// only show meaningless values.
export function useTweenedDomain(target: ChartDomain, resetKey: string): ChartDomain {
	const [displayed, setDisplayed] = useState<Displayed>({ key: resetKey, domain: target });
	const displayedRef = useRef(displayed.domain);
	const keyRef = useRef(resetKey);
	const { minAt, maxAt, maxValue } = target;
	const isReset = displayed.key !== resetKey;

	if (isReset) {
		setDisplayed({ key: resetKey, domain: target });
	}

	useEffect(() => {
		const to: ChartDomain = { minAt, maxAt, maxValue };
		const isNewKey = keyRef.current !== resetKey;

		keyRef.current = resetKey;

		if (isNewKey) {
			// Already shown by the render that saw the new key.
			displayedRef.current = to;

			return;
		}

		const from = displayedRef.current;
		const isAlreadyThere = from.minAt === minAt && from.maxAt === maxAt && from.maxValue === maxValue;

		if (isAlreadyThere) {
			return;
		}

		const isInstant = prefersReducedMotion();
		let frameId = 0;
		let startedAt: number | null = null;

		function step(now: number): void {
			startedAt ??= now;
			const progress = isInstant ? 1 : (now - startedAt) / DOMAIN_TWEEN_MS;
			const next = progress >= 1 ? to : interpolateDomain(from, to, progress);

			displayedRef.current = next;
			setDisplayed((current) => ({ key: current.key, domain: next }));

			if (progress < 1) {
				frameId = requestAnimationFrame(step);
			}
		}

		frameId = requestAnimationFrame(step);

		return () => cancelAnimationFrame(frameId);
	}, [minAt, maxAt, maxValue, resetKey]);

	return isReset ? target : displayed.domain;
}

function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
