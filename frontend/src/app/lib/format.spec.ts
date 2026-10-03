import { describe, expect, it } from 'vitest';

import { formatClockTime, formatDateTime, formatDurationMs } from './format';

const AT = '2026-09-26T15:04:00.000Z';

describe('formatDurationMs', () => {
	it.each([
		[30_000, '30 s'],
		[120_000, '2 min'],
		[3_600_000, '1 h'],
		[5_400_000, '1 h 30 min'],
	])('%s ms reads %s', (ms, expected) => {
		expect(formatDurationMs(ms)).toBe(expected);
	});
});

describe('date formatting', () => {
	it('formats a date and time, and a clock time, in the locale', () => {
		expect(formatDateTime(AT, 'pt-BR')).toBe(new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(AT)));
		expect(formatClockTime(Date.parse(AT), 'pt-BR')).toBe(new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(AT)));
	});

	it('reuses a formatter for the same locale and style', () => {
		expect(formatDateTime(AT, 'pt-BR')).toBe(formatDateTime(AT, 'pt-BR'));
	});
});
