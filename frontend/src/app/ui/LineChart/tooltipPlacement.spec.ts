import { describe, expect, it } from 'vitest';

import { computeTooltipStyle } from './tooltipPlacement';

describe('computeTooltipStyle', () => {
	it('opens to the right of the crosshair on the left half', () => {
		expect(computeTooltipStyle({ chartLeft: 100, chartTop: 50, chartWidth: 400, crosshairX: 40 })).toEqual({ top: 58, left: 152 });
	});

	it('opens to the left of the crosshair on the right half', () => {
		expect(computeTooltipStyle({ chartLeft: 100, chartTop: 50, chartWidth: 400, crosshairX: 300 })).toEqual({
			top: 58,
			left: 388,
			transform: 'translateX(-100%)',
		});
	});
});
