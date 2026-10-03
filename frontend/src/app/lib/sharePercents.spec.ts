import { describe, expect, it } from 'vitest';

import { toSharePercents } from './sharePercents';

describe('toSharePercents', () => {
	it('always adds up to 100, first come first served on ties', () => {
		expect(toSharePercents([1 / 3, 1 / 3, 1 / 3])).toEqual([34, 33, 33]);
		expect(toSharePercents([0.75, 0.25])).toEqual([75, 25]);
		expect(toSharePercents([0.666, 0.167, 0.167])).toEqual([66, 17, 17]);
	});

	it('normalizes fractions that do not add up to 1, and leaves no traffic at zero', () => {
		expect(toSharePercents([2, 2])).toEqual([50, 50]);
		expect(toSharePercents([0, 0])).toEqual([0, 0]);
		expect(toSharePercents([])).toEqual([]);
	});
});
