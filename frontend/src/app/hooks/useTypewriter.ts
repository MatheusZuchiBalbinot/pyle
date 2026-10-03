import { useEffect, useRef, useState } from 'react';

export type TypewriterState = {
	readonly visibleText: string;
	readonly isTyping: boolean;
};

// Reading pace for a short reply; a long one speeds up so it never takes
// longer than the cap to finish.
const TYPEWRITER_CHARS_PER_SECOND = 120;

export const TYPEWRITER_MAX_DURATION_MS = 2500;
const MS_PER_SECOND = 1000;
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export function typingSpeed(length: number): number {
	const readingSpeed = TYPEWRITER_CHARS_PER_SECOND / MS_PER_SECOND;

	return Math.max(readingSpeed, length / TYPEWRITER_MAX_DURATION_MS);
}

// Resumes from what is already shown, so a remount does not retype a finished reply.
export function useTypewriter(text: string, shouldAnimate: boolean): TypewriterState {
	const [visibleLength, setVisibleLength] = useState(shouldAnimate ? 0 : text.length);
	const visibleLengthRef = useRef(visibleLength);

	useEffect(() => {
		function reveal(length: number): void {
			visibleLengthRef.current = length;
			setVisibleLength(length);
		}

		const startLength = visibleLengthRef.current;

		if (startLength >= text.length) {
			return;
		}

		if (!shouldAnimate || prefersReducedMotion()) {
			const frameId = requestAnimationFrame(() => reveal(text.length));

			return () => cancelAnimationFrame(frameId);
		}

		const speed = typingSpeed(text.length);
		let startedAt: number | null = null;
		let frameId = 0;

		function step(now: number): void {
			startedAt ??= now;
			const next = Math.min(text.length, startLength + Math.ceil((now - startedAt) * speed));

			reveal(next);

			if (next < text.length) {
				frameId = requestAnimationFrame(step);
			}
		}

		frameId = requestAnimationFrame(step);

		return () => cancelAnimationFrame(frameId);
	}, [text, shouldAnimate]);

	return { visibleText: text.slice(0, visibleLength), isTyping: visibleLength < text.length };
}

function prefersReducedMotion(): boolean {
	return typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION_QUERY).matches;
}
