import { describe, expect, it } from 'vitest';

import { navigatedIndex, typeaheadIndex } from './selectNavigation';

describe('navigatedIndex', () => {
	it('moves down and up, stopping at the ends', () => {
		expect(navigatedIndex('ArrowDown', 0, 3)).toBe(1);
		expect(navigatedIndex('ArrowDown', 2, 3)).toBe(2);
		expect(navigatedIndex('ArrowUp', 1, 3)).toBe(0);
		expect(navigatedIndex('ArrowUp', 0, 3)).toBe(0);
	});

	it('jumps to the first and last option', () => {
		expect(navigatedIndex('Home', 2, 3)).toBe(0);
		expect(navigatedIndex('End', 0, 3)).toBe(2);
	});

	it('ignores keys that do not navigate', () => {
		expect(navigatedIndex('a', 0, 3)).toBeNull();
	});
});

describe('typeaheadIndex', () => {
	const labels = ['Round-robin', 'Menos conexões', 'Aleatório ponderado', 'Mais rápido'];

	it('finds the next option starting with the letter, case-insensitively', () => {
		expect(typeaheadIndex('m', 0, labels)).toBe(1);
		expect(typeaheadIndex('M', 1, labels)).toBe(3);
	});

	it('wraps around to the start', () => {
		expect(typeaheadIndex('r', 3, labels)).toBe(0);
	});

	it('returns null for no match or a non-printable key', () => {
		expect(typeaheadIndex('z', 0, labels)).toBeNull();
		expect(typeaheadIndex('Enter', 0, labels)).toBeNull();
		expect(typeaheadIndex(' ', 0, labels)).toBeNull();
	});
});
