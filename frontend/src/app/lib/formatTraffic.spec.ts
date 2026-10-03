import { describe, expect, it } from 'vitest';

import { formatCompactCount, formatLatency, formatRate, formatRps } from './formatTraffic';

describe('formatTraffic', () => {
	it('formats requests per second with one decimal, whole from 100 up', () => {
		expect(formatRps(12.345)).toBe('12,3/s');
		expect(formatRps(0)).toBe('0/s');
		expect(formatRps(1234.5)).toBe('1.235/s');
	});

	it('formats latency in ms or s, and a missing figure as a hyphen', () => {
		expect(formatLatency(null)).toBe('-');
		expect(formatLatency(0)).toBe('0 ms');
		expect(formatLatency(85.4)).toBe('85 ms');
		expect(formatLatency(1234)).toBe('1,2 s');
	});

	it('formats a fraction as a percent, never rounding a real rate to zero', () => {
		expect(formatRate(0)).toBe('0%');
		expect(formatRate(0.0123)).toBe('1,2%');
		expect(formatRate(0.000_05)).toBe('<0,1%');
		expect(formatRate(1)).toBe('100%');
	});

	it('compacts big counts', () => {
		expect(formatCompactCount(950)).toBe('950');
		expect(formatCompactCount(12_345)).toBe('12,3\u00a0mil');
		expect(formatCompactCount(1_896_415)).toBe('1,9\u00a0mi');
	});
});
