import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';

import { setCurrentSession, setRefreshHandler } from '@/app/api/accessTokenStore';
import { millisecondsUntilRefresh, refreshSession, login as requestLogin, logout as requestLogout, type AdminSession } from '@/app/api/authSession';
import { queryClient } from '@/app/core/query/queryClient';

import { AuthContext, type AuthContextValue, type AuthState } from './authContext';

type SignedOutReason = 'initial' | 'expired' | 'logged-out';

// The expiry drives the renewal timer; keeping it in state lets an effect own that timer.
type InternalState =
	| { readonly status: 'restoring' }
	| { readonly status: 'signed-out'; readonly reason: SignedOutReason }
	| { readonly status: 'signed-in'; readonly session: AdminSession };

export function AuthProvider({ children }: { readonly children: ReactNode }): ReactElement {
	const [internalState, setInternalState] = useState<InternalState>({ status: 'restoring' });
	// A burst of 401s triggers one refresh, not one per request.
	const pendingRefreshRef = useRef<Promise<string | null> | null>(null);

	const adoptSession = useCallback((session: AdminSession) => {
		setCurrentSession(session);
		setInternalState({ status: 'signed-in', session });
	}, []);

	const dropSession = useCallback((reason: SignedOutReason) => {
		setCurrentSession(null);
		// Nothing loaded for this session outlives it.
		queryClient.clear();
		setInternalState({ status: 'signed-out', reason });
	}, []);

	const renew = useCallback((): Promise<string | null> => {
		function handleSessionRenewed(session: AdminSession): string {
			adoptSession(session);

			return session.accessToken;
		}

		function handleRenewFailed(): null {
			dropSession('expired');

			return null;
		}

		function releasePendingRefresh(): void {
			pendingRefreshRef.current = null;
		}

		pendingRefreshRef.current ??= refreshSession().then(handleSessionRenewed, handleRenewFailed).finally(releasePendingRefresh);

		return pendingRefreshRef.current;
	}, [adoptSession, dropSession]);

	// A failure here is the normal signed-out case.
	useEffect(() => {
		let isCancelled = false;

		refreshSession().then(
			(session) => {
				if (!isCancelled) {
					adoptSession(session);
				}
			},
			() => {
				if (!isCancelled) {
					dropSession('initial');
				}
			},
		);

		return () => {
			isCancelled = true;
		};
	}, [adoptSession, dropSession]);

	const expiresAt = internalState.status === 'signed-in' ? internalState.session.expiresAt : null;

	useEffect(() => {
		if (expiresAt === null) {
			return;
		}

		const timerId = window.setTimeout(() => void renew(), millisecondsUntilRefresh(expiresAt));

		return () => window.clearTimeout(timerId);
	}, [expiresAt, renew]);

	useEffect(() => {
		setRefreshHandler(renew);

		return () => setRefreshHandler(null);
	}, [renew]);

	const signIn = useCallback(
		async (email: string, password: string) => {
			adoptSession(await requestLogin(email, password));
		},
		[adoptSession],
	);

	const signOut = useCallback(async () => {
		// Even if the revoke fails, the local session must not survive the click.
		await requestLogout().catch(() => undefined);
		dropSession('logged-out');
	}, [dropSession]);

	const state: AuthState = useMemo(() => {
		if (internalState.status === 'signed-in') {
			return { status: 'signed-in', user: internalState.session.user };
		}

		return internalState;
	}, [internalState]);

	const value: AuthContextValue = useMemo(() => ({ state, signIn, signOut }), [state, signIn, signOut]);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
