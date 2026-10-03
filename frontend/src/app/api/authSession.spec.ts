import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthError, login, logout, millisecondsUntilRefresh, refreshSession } from './authSession';

const API_BASE_URL = 'http://localhost:3000';
const REFRESH_MARGIN_MS = 60_000;
const SESSION = {
	accessToken: 'token',
	expiresAt: '2026-03-01T10:15:00.000Z',
	user: { id: 'u1', email: 'ops@pyle.local', name: 'Ops' },
};

function stubResponse(body: unknown, init: { status?: number; statusText?: string } = {}): Response {
	const status = init.status ?? 200;

	return {
		ok: status < 400,
		status,
		statusText: init.statusText ?? 'OK',
		json: () => Promise.resolve(body),
	} as Response;
}

function stubFetch(response: Response): ReturnType<typeof vi.fn> {
	const fetchStub = vi.fn().mockResolvedValue(response);

	globalThis.fetch = fetchStub as unknown as typeof fetch;

	return fetchStub;
}

describe('authSession', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('login', () => {
		it('posts the credentials and returns the session the API minted', async () => {
			const fetchStub = stubFetch(stubResponse(SESSION));

			const session = await login('ops@pyle.local', 'secret');

			expect(session).toEqual(SESSION);
			const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];

			expect(url).toBe(`${API_BASE_URL}/admin/auth/login`);
			expect(init.method).toBe('POST');
			expect(init.body).toBe(JSON.stringify({ email: 'ops@pyle.local', password: 'secret' }));
		});

		it('sends credentials, so the refresh cookie survives the cross-origin call', async () => {
			const fetchStub = stubFetch(stubResponse(SESSION));

			await login('ops@pyle.local', 'secret');

			const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];

			expect(init.credentials).toBe('include');
		});

		it('raises an AuthError carrying the status the console reacts to', async () => {
			stubFetch(stubResponse({ message: 'Invalid credentials' }, { status: 401 }));

			await expect(login('ops@pyle.local', 'wrong')).rejects.toMatchObject({
				name: 'AuthError',
				message: 'Invalid credentials',
				statusCode: 401,
			});
		});

		it('joins the validation messages when the API rejects the body field by field', async () => {
			stubFetch(stubResponse({ message: ['email must be an email', 'password is too short'] }, { status: 400 }));

			await expect(login('nope', 'x')).rejects.toThrow('email must be an email, password is too short');
		});

		it('falls back to the status text when the error body says nothing', async () => {
			stubFetch(stubResponse({}, { status: 500, statusText: 'Internal Server Error' }));

			await expect(login('ops@pyle.local', 'secret')).rejects.toThrow('Internal Server Error');
		});

		it('falls back to the status text when the error body is not even JSON', async () => {
			const unreadable = { ok: false, status: 502, statusText: 'Bad Gateway', json: () => Promise.reject(new Error('not json')) } as Response;

			stubFetch(unreadable);

			await expect(login('ops@pyle.local', 'secret')).rejects.toThrow('Bad Gateway');
		});
	});

	it('resumes a session from the refresh cookie with no body of its own', async () => {
		const fetchStub = stubFetch(stubResponse(SESSION));

		const session = await refreshSession();

		expect(session).toEqual(SESSION);
		const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];

		expect(url).toBe(`${API_BASE_URL}/admin/auth/refresh`);
		expect(init.body).toBeUndefined();
	});

	it('shares one refresh between callers at once, so the rotating token is never presented twice', async () => {
		// A fresh response per call: a body can only be read once.
		const fetchStub = vi.fn(() => Promise.resolve(stubResponse(SESSION)));

		globalThis.fetch = fetchStub as unknown as typeof fetch;
		const [first, second] = await Promise.all([refreshSession(), refreshSession()]);

		expect(first).toEqual(SESSION);
		expect(second).toEqual(SESSION);
		expect(fetchStub).toHaveBeenCalledTimes(1);

		await refreshSession();
		expect(fetchStub).toHaveBeenCalledTimes(2);
	});

	it('lets the next refresh through after one fails', async () => {
		const noSession = stubResponse({ message: 'no session' }, { status: 401 });
		const fetchStub = vi.fn().mockResolvedValueOnce(noSession).mockResolvedValueOnce(stubResponse(SESSION));

		globalThis.fetch = fetchStub as unknown as typeof fetch;

		await expect(refreshSession()).rejects.toThrow(AuthError);
		await expect(refreshSession()).resolves.toEqual(SESSION);
	});

	it('logs out through the API, so the server revokes the refresh token too', async () => {
		const fetchStub = stubFetch(stubResponse({}));

		await logout();

		expect((fetchStub.mock.calls[0] as [string])[0]).toBe(`${API_BASE_URL}/admin/auth/logout`);
	});

	describe('millisecondsUntilRefresh', () => {
		const NOW = new Date('2026-03-01T10:00:00.000Z');

		beforeEach(() => {
			vi.useFakeTimers();
			vi.setSystemTime(NOW);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it('schedules the refresh a minute before the token actually expires', () => {
			const expiresAt = new Date(NOW.getTime() + 15 * 60_000).toISOString();

			expect(millisecondsUntilRefresh(expiresAt)).toBe(15 * 60_000 - REFRESH_MARGIN_MS);
		});

		it('refreshes immediately when the token is already inside the margin', () => {
			const expiresAt = new Date(NOW.getTime() + 30_000).toISOString();

			expect(millisecondsUntilRefresh(expiresAt)).toBe(0);
		});

		it('never returns a negative delay for a token that already expired', () => {
			const expiresAt = new Date(NOW.getTime() - 60 * 60_000).toISOString();

			expect(millisecondsUntilRefresh(expiresAt)).toBe(0);
		});
	});

	it('exposes AuthError as a real Error, so a catch can rethrow it', () => {
		const error = new AuthError('nope', 403);

		expect(error).toBeInstanceOf(Error);
		expect(error.statusCode).toBe(403);
	});
});
