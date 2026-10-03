import type { CookieOptions, Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { clearRefreshCookie, readRefreshCookie, REFRESH_COOKIE_NAME, setRefreshCookie } from './refresh-cookie.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REFRESH_TOKEN_TTL_DAYS = 30;

type CookieCall = { name: string; value?: string; options: CookieOptions };

function buildResponse(): { response: Response; calls: CookieCall[]; cleared: CookieCall[] } {
	const calls: CookieCall[] = [];
	const cleared: CookieCall[] = [];
	const response = {
		cookie: (name: string, value: string, options: CookieOptions) => calls.push({ name, value, options }),
		clearCookie: (name: string, options: CookieOptions) => cleared.push({ name, options }),
	} as unknown as Response;

	return { response, calls, cleared };
}

function buildRequest(cookieHeader: string | undefined): Request {
	return { header: (name: string) => (name === 'cookie' ? cookieHeader : undefined) } as unknown as Request;
}

describe('the refresh cookie', () => {
	beforeEach(() => {
		process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS = String(REFRESH_TOKEN_TTL_DAYS);
	});

	afterEach(() => {
		delete process.env.ADMIN_REFRESH_TOKEN_TTL_DAYS;
		delete process.env.SECURE_COOKIES;
		vi.unstubAllEnvs();
	});

	describe('setting it', () => {
		it('is unreachable from any script on the page', () => {
			const { response, calls } = buildResponse();

			setRefreshCookie(response, 'refresh-token');

			expect(calls[0].options.httpOnly).toBe(true);
		});

		it('never rides along on a cross-site request', () => {
			const { response, calls } = buildResponse();

			setRefreshCookie(response, 'refresh-token');

			expect(calls[0].options.sameSite).toBe('strict');
		});

		it('is scoped to the auth routes only', () => {
			const { response, calls } = buildResponse();

			setRefreshCookie(response, 'refresh-token');

			expect(calls[0].options.path).toBe('/admin/auth');
		});

		it('lives exactly as long as the token behind it', () => {
			const { response, calls } = buildResponse();

			setRefreshCookie(response, 'refresh-token');

			expect(calls[0].options.maxAge).toBe(REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY);
		});

		it('carries the token under the expected name', () => {
			const { response, calls } = buildResponse();

			setRefreshCookie(response, 'refresh-token');

			expect(calls[0]).toEqual(expect.objectContaining({ name: REFRESH_COOKIE_NAME, value: 'refresh-token' }));
		});
	});

	describe('clearing it', () => {
		it('clears the same cookie, on the same path', () => {
			const { response, cleared } = buildResponse();

			clearRefreshCookie(response);

			expect(cleared[0].name).toBe(REFRESH_COOKIE_NAME);
			expect(cleared[0].options).toEqual(expect.objectContaining({ path: '/admin/auth', httpOnly: true, sameSite: 'strict' }));
		});

		// A maxAge on a clear would re-set the cookie instead of removing it.
		it('drops the lifetime when clearing', () => {
			const { response, cleared } = buildResponse();

			clearRefreshCookie(response);

			expect(cleared[0].options.maxAge).toBeUndefined();
		});
	});

	describe('reading it', () => {
		it('finds the token in a header carrying several cookies', () => {
			const request = buildRequest(`theme=dark; ${REFRESH_COOKIE_NAME}=abc123; locale=pt-BR`);

			expect(readRefreshCookie(request)).toBe('abc123');
		});

		it('finds it when it is the only cookie', () => {
			expect(readRefreshCookie(buildRequest(`${REFRESH_COOKIE_NAME}=abc123`))).toBe('abc123');
		});

		it('decodes a value the browser percent-encoded', () => {
			expect(readRefreshCookie(buildRequest(`${REFRESH_COOKIE_NAME}=a%2Bb%3Dc`))).toBe('a+b=c');
		});

		it('returns nothing when the request carries no cookies at all', () => {
			expect(readRefreshCookie(buildRequest(undefined))).toBeNull();
		});

		it('returns nothing when the session cookie is not among them', () => {
			expect(readRefreshCookie(buildRequest('theme=dark; locale=pt-BR'))).toBeNull();
		});

		it('skips a malformed entry rather than reading it as the token', () => {
			expect(readRefreshCookie(buildRequest(`flag; ${REFRESH_COOKIE_NAME}=abc123`))).toBe('abc123');
		});

		// `pyle_refresh_other=x` must not be mistaken for the real one.
		it('does not match a cookie whose name merely starts the same way', () => {
			expect(readRefreshCookie(buildRequest(`${REFRESH_COOKIE_NAME}_other=nope`))).toBeNull();
		});
	});
});
