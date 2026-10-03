import { randomBytes } from 'node:crypto';

import { API_KEY_PREFIX, API_KEY_RANDOM_BYTES, hashApiKey, toDisplayPrefix } from '@pyle/shared/contracts/api-key.js';

type GeneratedApiKey = {
	// Shown once to the operator, never stored.
	readonly key: string;
	readonly keyHash: string;
	readonly keyPrefix: string;
};

export function generateApiKey(): GeneratedApiKey {
	const key = `${API_KEY_PREFIX}${randomBytes(API_KEY_RANDOM_BYTES).toString('base64url')}`;

	return { key, keyHash: hashApiKey(key), keyPrefix: toDisplayPrefix(key) };
}
