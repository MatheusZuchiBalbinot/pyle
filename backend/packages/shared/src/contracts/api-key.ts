import { createHash } from 'node:crypto';

// Only the SHA-256 hash is stored; the display prefix identifies a key without revealing
// it.
export const API_KEY_PREFIX = 'pyle_live_';
export const API_KEY_RANDOM_BYTES = 32;
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;

export function hashApiKey(key: string): string {
	return createHash('sha256').update(key).digest('hex');
}

export function toDisplayPrefix(key: string): string {
	return key.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}
