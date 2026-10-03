import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getAccessToken, refreshAccessToken } from '@/app/api/accessTokenStore';
import { AuthError, type AdminSession } from '@/app/api/authSession';

import { AuthProvider } from './AuthProvider';
import { useAuth } from './useAuth';

vi.mock('../../api/authSession', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../../api/authSession')>();

	return {
		...actual,
		login: vi.fn(),
		logout: vi.fn(),
		refreshSession: vi.fn(),
	};
});

const { login, logout, refreshSession } = await import('../../api/authSession');

const USER = { id: 'u1', email: 'ops@pyle.local', name: 'Ops', lastLoginAt: null };
const ACCESS_TOKEN = 'access-token';
const RENEWED_TOKEN = 'renewed-token';
const TOKEN_LIFETIME_MS = 15 * 60_000;
const REFRESH_MARGIN_MS = 60_000;

function buildSession(accessToken: string, lifetimeMs = TOKEN_LIFETIME_MS): AdminSession {
	return { accessToken, expiresAt: new Date(Date.now() + lifetimeMs).toISOString(), user: USER };
}

function wrapper({ children }: { children: ReactNode }): ReactNode {
	return <AuthProvider>{children}</AuthProvider>;
}

function renderAuth() {
	return renderHook(() => useAuth(), { wrapper });
}

describe('AuthProvider', () => {
	beforeEach(() => {
		vi.mocked(refreshSession).mockRejectedValue(new AuthError('No session', 401));
		vi.mocked(login).mockResolvedValue(buildSession(ACCESS_TOKEN));
		vi.mocked(logout).mockResolvedValue(undefined);
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	describe('boot', () => {
		it('restores a session from the refresh cookie, so a reload does not flash the login screen', async () => {
			vi.mocked(refreshSession).mockResolvedValue(buildSession(ACCESS_TOKEN));

			const { result } = renderAuth();

			expect(result.current.state.status).toBe('restoring');
			await waitFor(() => expect(result.current.state).toEqual({ status: 'signed-in', user: USER }));
			expect(getAccessToken()).toBe(ACCESS_TOKEN);
		});

		it('treats a failed restore as nobody being signed in, not as an error', async () => {
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state).toEqual({ status: 'signed-out', reason: 'initial' }));
			expect(getAccessToken()).toBeNull();
		});
	});

	describe('signIn', () => {
		it('adopts the session the API minted and publishes its token to the API client', async () => {
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-out'));

			await act(async () => {
				await result.current.signIn('ops@pyle.local', 'secret');
			});

			expect(login).toHaveBeenCalledWith('ops@pyle.local', 'secret');
			expect(result.current.state).toEqual({ status: 'signed-in', user: USER });
			expect(getAccessToken()).toBe(ACCESS_TOKEN);
		});

		it('lets a failed sign-in surface, so the form can show why', async () => {
			vi.mocked(login).mockRejectedValue(new AuthError('Invalid credentials', 401));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-out'));

			await expect(act(async () => result.current.signIn('ops@pyle.local', 'wrong'))).rejects.toThrow('Invalid credentials');
			expect(result.current.state.status).toBe('signed-out');
		});
	});

	describe('signOut', () => {
		it('revokes the cookie server-side and drops the local session', async () => {
			vi.mocked(refreshSession).mockResolvedValue(buildSession(ACCESS_TOKEN));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			await act(async () => {
				await result.current.signOut();
			});

			expect(logout).toHaveBeenCalled();
			expect(result.current.state).toEqual({ status: 'signed-out', reason: 'logged-out' });
			expect(getAccessToken()).toBeNull();
		});

		// Otherwise a network blip would leave an operator apparently signed
		// in after they clicked "sair".
		it('drops the local session even when the revoke call fails', async () => {
			vi.mocked(refreshSession).mockResolvedValue(buildSession(ACCESS_TOKEN));
			vi.mocked(logout).mockRejectedValue(new Error('network down'));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			await act(async () => {
				await result.current.signOut();
			});

			expect(result.current.state.status).toBe('signed-out');
			expect(getAccessToken()).toBeNull();
		});
	});

	describe('the refresh handler the API client uses after a 401', () => {
		it('renews the token and hands it back', async () => {
			vi.mocked(refreshSession).mockResolvedValueOnce(buildSession(ACCESS_TOKEN)).mockResolvedValueOnce(buildSession(RENEWED_TOKEN));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			const token = await act(async () => refreshAccessToken());

			expect(token).toBe(RENEWED_TOKEN);
			expect(getAccessToken()).toBe(RENEWED_TOKEN);
		});

		it('collapses a burst of 401s into a single round trip', async () => {
			vi.mocked(refreshSession).mockResolvedValueOnce(buildSession(ACCESS_TOKEN)).mockResolvedValue(buildSession(RENEWED_TOKEN));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));
			const callsAfterBoot = vi.mocked(refreshSession).mock.calls.length;

			const tokens = await act(async () => Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]));

			expect(vi.mocked(refreshSession).mock.calls.length).toBe(callsAfterBoot + 1);
			expect(tokens).toEqual([RENEWED_TOKEN, RENEWED_TOKEN, RENEWED_TOKEN]);
		});

		it('signs the operator out when the session is really gone', async () => {
			vi.mocked(refreshSession).mockResolvedValueOnce(buildSession(ACCESS_TOKEN)).mockRejectedValue(new AuthError('Expired', 401));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			const token = await act(async () => refreshAccessToken());

			expect(token).toBeNull();
			await waitFor(() => expect(result.current.state).toEqual({ status: 'signed-out', reason: 'expired' }));
			expect(getAccessToken()).toBeNull();
		});

		it('is unregistered on unmount, so a stale provider cannot renew', async () => {
			vi.mocked(refreshSession).mockResolvedValue(buildSession(ACCESS_TOKEN));
			const { result, unmount } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			unmount();

			await expect(refreshAccessToken()).resolves.toBeNull();
		});
	});

	describe('renewal timer', () => {
		it('renews shortly before the token expires, without the operator doing anything', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			vi.mocked(refreshSession).mockResolvedValueOnce(buildSession(ACCESS_TOKEN)).mockResolvedValue(buildSession(RENEWED_TOKEN));
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-in'));

			await act(async () => {
				await vi.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS - REFRESH_MARGIN_MS + 100);
			});

			await waitFor(() => expect(getAccessToken()).toBe(RENEWED_TOKEN));
		});

		it('schedules nothing while signed out', async () => {
			vi.useFakeTimers({ shouldAdvanceTime: true });
			const { result } = renderAuth();

			await waitFor(() => expect(result.current.state.status).toBe('signed-out'));
			const callsAfterBoot = vi.mocked(refreshSession).mock.calls.length;

			await act(async () => {
				await vi.advanceTimersByTimeAsync(60 * 60_000);
			});

			expect(vi.mocked(refreshSession).mock.calls.length).toBe(callsAfterBoot);
		});
	});

	it('refuses to be used outside the provider instead of silently returning nothing', () => {
		expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within AuthProvider');
	});
});
