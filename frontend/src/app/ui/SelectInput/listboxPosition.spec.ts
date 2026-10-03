import { describe, expect, it } from 'vitest';

import { LISTBOX_MAX_HEIGHT_PX, listboxStyle } from './listboxPosition';

describe('listboxStyle', () => {
	it('opens below the trigger, as wide as it at least', () => {
		const style = listboxStyle({ top: 100, bottom: 134, left: 40, width: 180 }, 900);

		expect(style).toEqual({ left: 40, minWidth: 180, top: 138, maxHeight: LISTBOX_MAX_HEIGHT_PX });
	});

	it('opens above when there is no room below and more above', () => {
		const style = listboxStyle({ top: 800, bottom: 834, left: 40, width: 180 }, 900);

		expect(style).toEqual({ left: 40, minWidth: 180, bottom: 104, maxHeight: LISTBOX_MAX_HEIGHT_PX });
	});

	it('stays below and shrinks when below still has more room', () => {
		const style = listboxStyle({ top: 150, bottom: 184, left: 0, width: 100 }, 400);

		expect(style.top).toBe(188);
		expect(style.maxHeight).toBe(204);
	});
});
