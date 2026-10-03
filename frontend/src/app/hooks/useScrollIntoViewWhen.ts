import { useEffect, type RefObject } from 'react';

// Only as far as needed, animated: a jump loses the reader's place.
const SCROLL_OPTIONS: ScrollIntoViewOptions = { block: 'nearest', behavior: 'smooth' };

// Deferred one frame, so the target's content has rendered.
export function useScrollIntoViewWhen(elementRef: RefObject<HTMLElement | null>, scrollKey: string | null): void {
	useEffect(() => {
		if (scrollKey === null) {
			return;
		}

		const frameId = requestAnimationFrame(() => elementRef.current?.scrollIntoView(SCROLL_OPTIONS));

		return () => cancelAnimationFrame(frameId);
	}, [elementRef, scrollKey]);
}
