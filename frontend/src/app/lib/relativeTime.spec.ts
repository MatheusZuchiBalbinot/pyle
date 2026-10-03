import { describe, expect, it } from 'vitest';

import { formatRelativeTime } from './relativeTime';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');

function ago(ms: number): string {
	return new Date(NOW - ms).toISOString();
}

describe('formatRelativeTime', () => {
	it('picks the largest unit that fits', () => {
		expect(formatRelativeTime(ago(2000), NOW, 'pt-BR')).toBe('agora');
		expect(formatRelativeTime(ago(42_000), NOW, 'pt-BR')).toBe('há 42 seg.');
		expect(formatRelativeTime(ago(5 * 60_000), NOW, 'pt-BR')).toBe('há 5 min.');
		expect(formatRelativeTime(ago(3 * 3_600_000), NOW, 'pt-BR')).toBe('há 3 h');
		expect(formatRelativeTime(ago(2 * 86_400_000), NOW, 'pt-BR')).toBe('anteontem');
	});

	it('never says something happened in the future', () => {
		expect(formatRelativeTime(ago(-60_000), NOW, 'pt-BR')).toBe('agora');
	});
});
