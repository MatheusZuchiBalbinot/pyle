import { describe, expect, it } from 'vitest';

import { buildInstance, TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { WeightedRandomBalancer } from './weighted-random.js';

const LIGHT = buildInstance('light', { weight: 1 });
const HEAVY = buildInstance('heavy', { weight: 3 });
const DRAWS = 4000;
const TOLERANCE = 0.02;

describe('WeightedRandomBalancer', () => {
	it('picks in proportion to the weights', () => {
		let draw = 0;
		// Evenly spread over [0, 1): deterministic, and every value is hit.
		const balancer = new WeightedRandomBalancer(() => (draw++ % DRAWS) / DRAWS);
		let heavyCount = 0;

		for (let index = 0; index < DRAWS; index++) {
			if (balancer.select({ service: TEST_SERVICE, candidates: [LIGHT, HEAVY] }) === HEAVY) {
				heavyCount++;
			}
		}

		expect(Math.abs(heavyCount / DRAWS - 0.75)).toBeLessThanOrEqual(TOLERANCE);
	});

	it('maps the edges of the range to the first and last instance', () => {
		expect(new WeightedRandomBalancer(() => 0).select({ service: TEST_SERVICE, candidates: [LIGHT, HEAVY] })).toBe(LIGHT);
		expect(new WeightedRandomBalancer(() => 0.9999999).select({ service: TEST_SERVICE, candidates: [LIGHT, HEAVY] })).toBe(HEAVY);
	});

	it('falls back to the last instance on a rounding overshoot', () => {
		expect(new WeightedRandomBalancer(() => 1).select({ service: TEST_SERVICE, candidates: [LIGHT, HEAVY] })).toBe(HEAVY);
	});

	it('uses Math.random by default', () => {
		expect([LIGHT, HEAVY]).toContain(new WeightedRandomBalancer().select({ service: TEST_SERVICE, candidates: [LIGHT, HEAVY] }));
	});
});
