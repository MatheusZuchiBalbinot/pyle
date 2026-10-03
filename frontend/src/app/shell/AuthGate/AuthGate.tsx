import type { ReactElement, ReactNode } from 'react';

import { useAuth } from '@/app/core/auth/useAuth';
import { LoginPage } from '@/app/features/auth/LoginPage';

import './AuthGate.css';

// Nothing authenticated mounts before a session, or the data hooks would fire a wall of
// 401s.
export function AuthGate({ children }: { readonly children: ReactNode }): ReactElement {
	const { state } = useAuth();

	if (state.status === 'restoring') {
		return <div className="auth-gate-restoring" aria-hidden="true" />;
	}

	if (state.status === 'signed-out') {
		return <LoginPage />;
	}

	return <>{children}</>;
}
