import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RealtimeTokenService } from './realtime-token.service.js';

const SECRET = 'test-hmac-secret';

type Claims = { sub: string; exp: number; iat: number; channels: string[] };

function decodeSegment<T>(segment: string): T {
	return JSON.parse(Buffer.from(segment, 'base64url').toString()) as T;
}

describe('RealtimeTokenService', () => {
	beforeEach(() => {
		process.env.CENTRIFUGO_URL = 'http://centrifugo:8000';
		process.env.CENTRIFUGO_PUBLIC_URL = 'ws://localhost:48000/connection/websocket';
		process.env.CENTRIFUGO_API_KEY = 'api-key';
		process.env.CENTRIFUGO_TOKEN_HMAC_SECRET = SECRET;
	});
	afterEach(() => {
		delete process.env.CENTRIFUGO_URL;
		delete process.env.CENTRIFUGO_PUBLIC_URL;
		delete process.env.CENTRIFUGO_API_KEY;
		delete process.env.CENTRIFUGO_TOKEN_HMAC_SECRET;
	});

	it('mints an HS256 token whose signature verifies against the shared secret', () => {
		const { token } = new RealtimeTokenService().mintAdminConnection();
		const [header, payload, signature] = token.split('.');
		const expected = createHmac('sha256', SECRET).update(`${header}.${payload}`).digest('base64url');

		expect(signature).toBe(expected);
		expect(decodeSegment<{ alg: string }>(header).alg).toBe('HS256');
	});

	it('grants the admin console only the admin channel', () => {
		const connection = new RealtimeTokenService().mintAdminConnection();
		const claims = decodeSegment<Claims>(connection.token.split('.')[1]);

		expect(claims.sub).toBe('admin');
		expect(claims.channels).toEqual(['admin:events']);
		expect(connection.channels).toEqual(['admin:events']);
	});

	it('expires one hour after issue and reports the same instant to the client', () => {
		const connection = new RealtimeTokenService().mintAdminConnection();
		const claims = decodeSegment<Claims>(connection.token.split('.')[1]);

		expect(claims.exp - claims.iat).toBe(3600);
		expect(new Date(connection.expiresAt).getTime()).toBe(claims.exp * 1000);
		expect(connection.url).toBe('ws://localhost:48000/connection/websocket');
	});
});
