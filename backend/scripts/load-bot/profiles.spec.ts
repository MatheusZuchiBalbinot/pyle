import { describe, expect, it } from 'vitest';

import { ABUSIVE_RPS, isBotProfileName, requestsForTick, targetRps } from './profiles.js';

describe('bot profiles', () => {
	it('keeps steady and chaos at the base rate', () => {
		for (const profile of ['steady', 'chaos'] as const) {
			expect(targetRps(profile, 50, 12_345)).toBe(50);
		}
	});

	it('waves mixed around the base rate, between about 300 and 800 for 550, every 10 min', () => {
		expect(targetRps('mixed', 550, 0)).toBeCloseTo(550);
		expect(targetRps('mixed', 550, 150_000)).toBeCloseTo(797.5);
		expect(targetRps('mixed', 550, 300_000)).toBeCloseTo(550);
		expect(targetRps('mixed', 550, 450_000)).toBeCloseTo(302.5);
		expect(targetRps('mixed', 550, 600_000)).toBeCloseTo(550);
	});

	it('averages the base rate over a cycle', () => {
		const samples = Array.from({ length: 600 }, (_, second) => targetRps('mixed', 550, second * 1000));
		const mean = samples.reduce((sum, rps) => sum + rps, 0) / samples.length;

		expect(mean).toBeCloseTo(550);
	});

	it('bursts to five times the rate for 5 s every 20 s', () => {
		expect(targetRps('burst', 10, 1000)).toBe(50);
		expect(targetRps('burst', 10, 6000)).toBe(10);
		expect(targetRps('burst', 10, 21_000)).toBe(50);
	});

	it('ramps a spike up to ten times in 30 s and back', () => {
		expect(targetRps('spike', 10, 0)).toBe(10);
		expect(targetRps('spike', 10, 15_000)).toBe(55);
		expect(targetRps('spike', 10, 30_000)).toBe(100);
		expect(targetRps('spike', 10, 45_000)).toBe(55);
	});

	it('sends the abusive rate whatever the base', () => {
		expect(targetRps('abusive', 500, 0)).toBe(ABUSIVE_RPS);
	});

	it('carries fractions over ticks so the rate is exact', () => {
		let carry = 0;
		let sent = 0;

		for (let tick = 0; tick < 10; tick++) {
			const budget = requestsForTick(2.5, 100, carry);

			sent += budget.count;
			carry = budget.carry;
		}

		expect(sent).toBe(2);
		expect(carry).toBeCloseTo(0.5);
	});

	it('knows its profile names', () => {
		expect(isBotProfileName('spike')).toBe(true);
		expect(isBotProfileName('ddos')).toBe(false);
	});
});
