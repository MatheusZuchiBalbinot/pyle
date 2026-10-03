import { useEffect, useState } from 'react';

export type TooltipSide = 'top' | 'bottom';

export type ActiveTooltip = {
	readonly text: string;
	readonly anchorRect: DOMRect;
	readonly side: TooltipSide;
};

// Document-level listeners: tooltips need no wiring beyond the attribute.
export function useActiveTooltip(): ActiveTooltip | null {
	const [activeTooltip, setActiveTooltip] = useState<ActiveTooltip | null>(null);

	useEffect(() => {
		let currentAnchor: HTMLElement | null = null;
		// Focus shows a tooltip only after keyboard navigation (like :focus-visible).
		let isPointerInteraction = false;

		function show(anchor: HTMLElement | null): void {
			if (anchor === currentAnchor) {
				return;
			}

			currentAnchor = anchor;
			setActiveTooltip(anchor ? toActiveTooltip(anchor) : null);
		}

		function hide(): void {
			show(null);
		}

		function handlePointerOver(event: Event): void {
			show(resolveAnchor(event.target));
		}

		function handlePointerOut(event: MouseEvent): void {
			if (!currentAnchor) {
				return;
			}

			const next = event.relatedTarget;

			if (next instanceof Node && currentAnchor.contains(next)) {
				return;
			}

			hide();
		}

		function handleFocusIn(event: Event): void {
			if (isPointerInteraction) {
				return;
			}

			show(resolveAnchor(event.target));
		}

		function handleMouseDown(): void {
			isPointerInteraction = true;
			hide();
		}

		function handleKeyDown(): void {
			isPointerInteraction = false;
			hide();
		}

		document.addEventListener('mouseover', handlePointerOver);
		document.addEventListener('mouseout', handlePointerOut);
		document.addEventListener('focusin', handleFocusIn);
		document.addEventListener('focusout', hide);
		document.addEventListener('mousedown', handleMouseDown);
		document.addEventListener('scroll', hide, true);
		document.addEventListener('keydown', handleKeyDown);
		window.addEventListener('resize', hide);

		return () => {
			document.removeEventListener('mouseover', handlePointerOver);
			document.removeEventListener('mouseout', handlePointerOut);
			document.removeEventListener('focusin', handleFocusIn);
			document.removeEventListener('focusout', hide);
			document.removeEventListener('mousedown', handleMouseDown);
			document.removeEventListener('scroll', hide, true);
			document.removeEventListener('keydown', handleKeyDown);
			window.removeEventListener('resize', hide);
		};
	}, []);

	return activeTooltip;
}

function resolveAnchor(target: EventTarget | null): HTMLElement | null {
	if (!(target instanceof Element)) {
		return null;
	}

	const anchor = target.closest('[data-tooltip]');

	return anchor instanceof HTMLElement ? anchor : null;
}

function toActiveTooltip(anchor: HTMLElement): ActiveTooltip | null {
	const text = anchor.dataset.tooltip;

	if (!text) {
		return null;
	}

	// An open dropdown trigger has its menu right where the tooltip would
	// go; the menu is the more useful thing to see.
	if (anchor.getAttribute('aria-expanded') === 'true') {
		return null;
	}

	const side: TooltipSide = anchor.dataset.tooltipSide === 'top' ? 'top' : 'bottom';

	return { text, anchorRect: anchor.getBoundingClientRect(), side };
}
