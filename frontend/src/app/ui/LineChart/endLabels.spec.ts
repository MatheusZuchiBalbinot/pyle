import { describe, expect, it } from 'vitest';

import { pickVisibleEndLabels } from './endLabels';

describe('pickVisibleEndLabels', () => {
	it('labels every line whose ends are far apart', () => {
		const visible = pickVisibleEndLabels([
			{ seriesId: 'a', y: 20 },
			{ seriesId: 'b', y: 60 },
		]);

		expect([...visible]).toEqual(['a', 'b']);
	});

	it('keeps the first series label when two lines end at the same height', () => {
		const visible = pickVisibleEndLabels([
			{ seriesId: 'a', y: 100 },
			{ seriesId: 'b', y: 104 },
			{ seriesId: 'c', y: 140 },
		]);

		expect([...visible]).toEqual(['a', 'c']);
	});
});
