import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import { useActiveTooltip, type ActiveTooltip } from '@/app/hooks/useActiveTooltip';

import './TooltipLayer.css';

const ANCHOR_GAP_PX = 8;
const VIEWPORT_MARGIN_PX = 8;

// Portaled to body, so no ancestor's overflow or stacking context can clip or cover it.
export function TooltipLayer(): ReactElement | null {
	const activeTooltip = useActiveTooltip();
	const bubbleRef = useRef<HTMLDivElement>(null);
	const [style, setStyle] = useState<CSSProperties | null>(null);

	useLayoutEffect(() => {
		if (!activeTooltip || !bubbleRef.current) {
			setStyle(null);

			return;
		}

		setStyle(computeStyle(activeTooltip, bubbleRef.current.offsetWidth, window.innerWidth));
	}, [activeTooltip]);

	if (!activeTooltip) {
		return null;
	}

	return createPortal(
		<div ref={bubbleRef} role="tooltip" className={`tooltip-bubble ${style ? 'is-visible' : ''}`.trim()} style={style ?? undefined}>
			{activeTooltip.text}
		</div>,
		document.body,
	);
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

function computeStyle(tooltip: ActiveTooltip, bubbleWidth: number, viewportWidth: number): CSSProperties {
	const halfWidth = bubbleWidth / 2;
	const centerX = tooltip.anchorRect.left + tooltip.anchorRect.width / 2;
	const left = clamp(centerX, VIEWPORT_MARGIN_PX + halfWidth, viewportWidth - VIEWPORT_MARGIN_PX - halfWidth);

	if (tooltip.side === 'top') {
		return { left, bottom: window.innerHeight - tooltip.anchorRect.top + ANCHOR_GAP_PX };
	}

	return { left, top: tooltip.anchorRect.bottom + ANCHOR_GAP_PX };
}
