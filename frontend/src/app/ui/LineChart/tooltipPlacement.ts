import type { CSSProperties } from 'react';

export type TooltipAnchor = {
	readonly chartLeft: number;
	readonly chartTop: number;
	readonly chartWidth: number;
	readonly crosshairX: number;
};

// Gap between the crosshair and the tooltip.
const CROSSHAIR_GAP_PX = 12;
const TOP_OFFSET_PX = 8;

// On whichever side of the crosshair has room, so it never runs off the card.
export function computeTooltipStyle(anchor: TooltipAnchor): CSSProperties {
	const top = anchor.chartTop + TOP_OFFSET_PX;
	const crosshairLeft = anchor.chartLeft + anchor.crosshairX;
	const isOnLeftHalf = anchor.crosshairX < anchor.chartWidth / 2;

	if (isOnLeftHalf) {
		return { top, left: crosshairLeft + CROSSHAIR_GAP_PX };
	}

	return { top, left: crosshairLeft - CROSSHAIR_GAP_PX, transform: 'translateX(-100%)' };
}
