import { describe, expect, it } from 'vitest';

import { ConfigValidationError } from '../../gateway-config/domain/config-errors.js';
import { resolveTrafficWindow, type TrafficWindowInput } from './traffic-window.js';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const LIMITS = { nowMs: NOW, retentionHours: 24 };
const HOUR = 3_600_000;

function range(fromOffsetMs: number, toOffsetMs: number): TrafficWindowInput {
	return { kind: 'range', from: new Date(NOW - fromOffsetMs), to: new Date(NOW - toOffsetMs) };
}

describe('resolveTrafficWindow', () => {
	it.each([
		{ window: '15m', minutes: 15, stepSeconds: 10 },
		{ window: '1h', minutes: 60, stepSeconds: 60 },
		{ window: '6h', minutes: 360, stepSeconds: 60 },
		{ window: '24h', minutes: 1440, stepSeconds: 300 },
	] as const)('resolves $window to its span and step', ({ window, minutes, stepSeconds }) => {
		const resolved = resolveTrafficWindow({ kind: 'named', window }, LIMITS);

		expect(resolved).toEqual({ from: new Date(NOW - minutes * 60_000), to: new Date(NOW), stepSeconds });
	});

	it('starts the window on a step edge', () => {
		const resolved = resolveTrafficWindow({ kind: 'range', from: new Date(NOW - 3_599_000), to: new Date(NOW) }, LIMITS);

		expect(resolved.from).toEqual(new Date(NOW - HOUR));
	});

	it('accepts an explicit range and picks the step from its length', () => {
		expect(resolveTrafficWindow(range(2 * HOUR, HOUR), LIMITS).stepSeconds).toBe(60);
		expect(resolveTrafficWindow(range(HOUR, HOUR - 60_000), LIMITS).stepSeconds).toBe(10);
	});

	it.each([
		{ name: 'from after to', input: range(HOUR, 2 * HOUR), message: 'before' },
		{ name: 'an empty range', input: range(HOUR, HOUR), message: 'before' },
		{ name: 'more than 24 hours', input: range(25 * HOUR, 0), message: '24 hours' },
		{ name: 'reaching past retention', input: range(25 * HOUR, 23 * HOUR), message: 'kept for 24 hours' },
	])('rejects $name', ({ input, message }) => {
		expect(() => resolveTrafficWindow(input, LIMITS)).toThrow(ConfigValidationError);
		expect(() => resolveTrafficWindow(input, LIMITS)).toThrow(message);
	});

	it('respects a shorter retention for named windows too', () => {
		expect(() => resolveTrafficWindow({ kind: 'named', window: '24h' }, { nowMs: NOW, retentionHours: 6 })).toThrow('kept for 6 hours');
	});
});
