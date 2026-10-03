import { describe, expect, it } from 'vitest';

import { API_KEY_DISPLAY_PREFIX_LENGTH, hashApiKey, toDisplayPrefix } from './api-key.js';

describe('api key helpers', () => {
	it('hashes with SHA-256 hex', () => {
		expect(hashApiKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
	});

	it('shows only the display prefix', () => {
		const prefix = toDisplayPrefix('pyle_live_AbCdEfGh');

		expect(prefix).toBe('pyle_live_Ab');
		expect(prefix).toHaveLength(API_KEY_DISPLAY_PREFIX_LENGTH);
	});
});
