import type { CSSProperties } from 'react';

export type AnchorRect = Pick<DOMRect, 'top' | 'bottom' | 'left' | 'width'>;

const ANCHOR_GAP_PX = 4;
const VIEWPORT_MARGIN_PX = 8;

export const LISTBOX_MAX_HEIGHT_PX = 280;

// Below the trigger, or above it when the viewport has no room below and more above.
export function listboxStyle(anchor: AnchorRect, viewportHeight: number): CSSProperties {
	const spaceBelow = viewportHeight - anchor.bottom - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
	const spaceAbove = anchor.top - ANCHOR_GAP_PX - VIEWPORT_MARGIN_PX;
	const shouldOpenUp = spaceBelow < LISTBOX_MAX_HEIGHT_PX && spaceAbove > spaceBelow;
	const base: CSSProperties = { left: anchor.left, minWidth: anchor.width };

	if (shouldOpenUp) {
		return { ...base, bottom: viewportHeight - anchor.top + ANCHOR_GAP_PX, maxHeight: Math.min(LISTBOX_MAX_HEIGHT_PX, spaceAbove) };
	}

	return { ...base, top: anchor.bottom + ANCHOR_GAP_PX, maxHeight: Math.min(LISTBOX_MAX_HEIGHT_PX, spaceBelow) };
}
