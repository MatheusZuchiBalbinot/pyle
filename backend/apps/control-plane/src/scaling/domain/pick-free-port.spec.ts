import { describe, expect, it } from 'vitest';

import { pickFreePort } from './pick-free-port.js';

const RANGE = { min: 100, max: 102 };

describe('pickFreePort', () => {
	it('picks the lowest free port', () => {
		expect(pickFreePort(new Set([100]), RANGE)).toBe(101);
		expect(pickFreePort(new Set(), RANGE)).toBe(100);
	});

	it('answers null when the range is full', () => {
		expect(pickFreePort(new Set([100, 101, 102]), RANGE)).toBeNull();
	});
});
