import { describe, expect, it } from 'vitest';

import { hashApiKey } from '@pyle/shared/contracts/api-key.js';

import { generateApiKey } from './generate-api-key.js';

const BASE64URL_OF_32_BYTES_LENGTH = 43;

describe('generateApiKey', () => {
	it('builds a prefixed base64url key with its hash and display prefix', () => {
		const generated = generateApiKey();

		expect(generated.key).toMatch(new RegExp(`^pyle_live_[A-Za-z0-9_-]{${BASE64URL_OF_32_BYTES_LENGTH}}$`));
		expect(generated.keyHash).toBe(hashApiKey(generated.key));
		expect(generated.keyPrefix).toBe(generated.key.slice(0, 12));
	});

	it('never repeats a key', () => {
		expect(generateApiKey().key).not.toBe(generateApiKey().key);
	});
});
