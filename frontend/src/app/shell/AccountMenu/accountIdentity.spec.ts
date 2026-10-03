import { describe, expect, it } from 'vitest';

import { toAvatarHue, toInitials } from './accountIdentity';

describe('toInitials', () => {
	it('takes the first and last word of a full name', () => {
		expect(toInitials('Maria da Silva', 'maria@pyle.local')).toBe('MS');
	});

	it('takes the first two letters of a single-word name', () => {
		expect(toInitials('ops', 'ops@pyle.local')).toBe('OP');
	});

	it('falls back to the email when the name is blank', () => {
		expect(toInitials('   ', 'admin@pyle.local')).toBe('AD');
	});
});

describe('toAvatarHue', () => {
	it('gives the same account the same hue, whatever the casing', () => {
		expect(toAvatarHue('Admin@Pyle.local')).toBe(toAvatarHue('admin@pyle.local'));
	});

	it('stays on the hue circle', () => {
		const hue = toAvatarHue('a-rather-long-address.with.dots@some-company.example.com');

		expect(hue).toBeGreaterThanOrEqual(0);
		expect(hue).toBeLessThan(360);
	});

	it('tells different accounts apart', () => {
		expect(toAvatarHue('admin@pyle.local')).not.toBe(toAvatarHue('ops@pyle.local'));
	});
});
