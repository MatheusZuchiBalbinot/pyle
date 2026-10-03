import { describe, expect, it } from 'vitest';

import { chartTransitionKey } from './chartTransitionKey';

const HOUR = { from: '2026-09-30T21:00:00.000Z', to: '2026-09-30T22:00:00.000Z' };

describe('chartTransitionKey', () => {
	// Regression: live refreshes remounted the chart and replayed its drawing animation,
	// leaving it blank for a moment. Windows as the server sent them, a refresh apart.
	it('keeps the key across live refreshes, whatever part of the minute they land in', () => {
		const refreshes = [
			{ from: '2026-10-01T00:19:00.000Z', to: '2026-10-01T01:19:41.522Z' },
			{ from: '2026-10-01T00:19:00.000Z', to: '2026-10-01T01:19:51.522Z' },
			{ from: '2026-10-01T00:20:00.000Z', to: '2026-10-01T01:20:01.521Z' },
		];

		const keys = refreshes.map((window) => chartTransitionKey('requests', window));

		expect(new Set(keys)).toEqual(new Set([chartTransitionKey('requests', HOUR)]));
	});

	it('changes with the metric and with the window length', () => {
		const quarter = { from: '2026-09-30T21:45:00.000Z', to: '2026-09-30T22:00:00.000Z' };

		expect(chartTransitionKey('latency', HOUR)).not.toBe(chartTransitionKey('requests', HOUR));
		expect(chartTransitionKey('requests', quarter)).not.toBe(chartTransitionKey('requests', HOUR));
	});
});
