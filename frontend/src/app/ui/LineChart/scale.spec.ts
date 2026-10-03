import { describe, expect, it } from 'vitest';

import { niceTicks, scaleLinear } from './scale';

describe('niceTicks', () => {
	it('picks round steps that cover the maximum', () => {
		expect(niceTicks(100)).toEqual([0, 50, 100]);
		expect(niceTicks(7)).toEqual([0, 2, 4, 6, 8]);
		expect(niceTicks(1800)).toEqual([0, 500, 1000, 1500, 2000]);
	});

	it('honors a minimum step and an empty series', () => {
		expect(niceTicks(3, 1)).toEqual([0, 1, 2, 3]);
		expect(niceTicks(0)).toEqual([0, 1]);
		expect(niceTicks(0, 5)).toEqual([0, 5]);
		expect(niceTicks(0, 0.01)).toEqual([0, 0.01]);
	});
});

describe('scaleLinear', () => {
	it('maps the domain onto the range, inverted axes included', () => {
		const toY = scaleLinear(0, 100, 200, 0);

		expect(toY(0)).toBe(200);
		expect(toY(50)).toBe(100);
		expect(toY(100)).toBe(0);
	});

	it('survives an empty domain', () => {
		expect(scaleLinear(5, 5, 0, 10)(5)).toBe(0);
	});
});
