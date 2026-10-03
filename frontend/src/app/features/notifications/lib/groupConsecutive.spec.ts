import { describe, expect, it } from 'vitest';

import { groupConsecutive } from './groupConsecutive';

describe('groupConsecutive', () => {
	it('folds neighbours with the same key and keeps the order', () => {
		const groups = groupConsecutive(['a1', 'a2', 'b1', 'a3'], (item) => item[0]);

		expect(groups.map((group) => group.items)).toEqual([['a1', 'a2'], ['b1'], ['a3']]);
		expect(groups[0].first).toBe('a1');
	});

	it('returns nothing for an empty list', () => {
		expect(groupConsecutive([], String)).toEqual([]);
	});
});
