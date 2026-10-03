import { createContext } from 'react';

import type { AdminUser } from '@/app/api/adminApiTypes';

// restoring: the boot state, so a reload never flashes the login screen at a signed-in
// operator.
export type AuthState =
	| { readonly status: 'restoring' }
	| { readonly status: 'signed-out'; readonly reason: 'initial' | 'expired' | 'logged-out' }
	| { readonly status: 'signed-in'; readonly user: AdminUser };

export type AuthContextValue = {
	readonly state: AuthState;
	readonly signIn: (email: string, password: string) => Promise<void>;
	readonly signOut: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);
