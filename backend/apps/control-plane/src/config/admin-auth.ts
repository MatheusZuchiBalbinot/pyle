import { readPositiveIntEnv, readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

const MIN_JWT_SECRET_LENGTH = 32;
const DEFAULT_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const DEFAULT_REFRESH_TOKEN_TTL_DAYS = 14;

// Separate from every other secret: one shared with another system must not mint operator
// sessions.
export function getAdminJwtSecret(): string {
	const secret = readRequiredEnv('ADMIN_JWT_SECRET');

	if (secret.length < MIN_JWT_SECRET_LENGTH) {
		throw new Error(`ADMIN_JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters (got ${secret.length})`);
	}

	return secret;
}

export function getAccessTokenTtlSeconds(): number {
	return readPositiveIntEnv('ADMIN_ACCESS_TOKEN_TTL_S', DEFAULT_ACCESS_TOKEN_TTL_SECONDS);
}

export function getRefreshTokenTtlDays(): number {
	return readPositiveIntEnv('ADMIN_REFRESH_TOKEN_TTL_DAYS', DEFAULT_REFRESH_TOKEN_TTL_DAYS);
}

// A Secure cookie is dropped over plain HTTP, so local development needs this off.
export function getIsSecureCookieRequired(): boolean {
	return (process.env.ADMIN_COOKIE_SECURE ?? 'false') === 'true';
}
