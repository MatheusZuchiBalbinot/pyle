import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminTokenService } from './admin-token.service.js';

const SECRET = 'a-secret-long-enough-for-the-config-check';
const CLAIMS = { userId: 'user-1', email: 'ops@example.com' };

describe('AdminTokenService', () => {
	const service = new AdminTokenService();

	beforeEach(() => {
		process.env.ADMIN_JWT_SECRET = SECRET;
	});
	afterEach(() => {
		delete process.env.ADMIN_JWT_SECRET;
		delete process.env.ADMIN_ACCESS_TOKEN_TTL_S;
		vi.useRealTimers();
	});

	it('round-trips the claims it minted', async () => {
		const { token, expiresAt } = await service.mintAccessToken(CLAIMS);

		await expect(service.verifyAccessToken(token)).resolves.toEqual(CLAIMS);
		expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
	});

	it('rejects a token signed with a different secret', async () => {
		const { token } = await service.mintAccessToken(CLAIMS);

		process.env.ADMIN_JWT_SECRET = `${SECRET}-rotated`;

		await expect(service.verifyAccessToken(token)).resolves.toBeNull();
	});

	it('rejects a tampered payload', async () => {
		const { token } = await service.mintAccessToken(CLAIMS);
		const [header, payload, signature] = token.split('.');
		const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: 'someone-else' })).toString(
			'base64url',
		);

		await expect(service.verifyAccessToken(`${header}.${forged}.${signature}`)).resolves.toBeNull();
	});

	it('rejects an expired token', async () => {
		process.env.ADMIN_ACCESS_TOKEN_TTL_S = '60';
		const { token } = await service.mintAccessToken(CLAIMS);

		vi.useFakeTimers();
		vi.setSystemTime(new Date(Date.now() + 61_000));

		await expect(service.verifyAccessToken(token)).resolves.toBeNull();
	});

	// An attacker who can pick the algorithm can turn "verify with the
	// secret" into "verify with nothing" — the classic JWT footgun.
	it('rejects an unsigned (alg: none) token', async () => {
		const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
		const payload = Buffer.from(JSON.stringify({ sub: 'user-1', email: CLAIMS.email, exp: Math.floor(Date.now() / 1000) + 600 })).toString(
			'base64url',
		);

		await expect(service.verifyAccessToken(`${header}.${payload}.`)).resolves.toBeNull();
	});

	it('rejects a correctly-signed token minted for something else', async () => {
		const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
		const payload = Buffer.from(
			JSON.stringify({ sub: 'user-1', email: CLAIMS.email, iss: 'somewhere-else', aud: 'another-app', exp: Math.floor(Date.now() / 1000) + 600 }),
		).toString('base64url');
		const signature = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');

		await expect(service.verifyAccessToken(`${header}.${payload}.${signature}`)).resolves.toBeNull();
	});

	it.each([
		['garbage', 'not-a-token'],
		['empty', ''],
		['two segments', 'aaa.bbb'],
	])('rejects %s', async (_label, token) => {
		await expect(service.verifyAccessToken(token)).resolves.toBeNull();
	});

	it('generates unguessable refresh tokens and stores only their hash', () => {
		const first = service.generateRefreshToken();
		const second = service.generateRefreshToken();

		expect(first).not.toEqual(second);
		expect(Buffer.from(first, 'base64url')).toHaveLength(32);
		expect(service.hashRefreshToken(first)).toHaveLength(64);
		expect(service.hashRefreshToken(first)).toBe(service.hashRefreshToken(first));
		expect(service.hashRefreshToken(first)).not.toBe(service.hashRefreshToken(second));
	});
});
