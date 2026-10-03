import type { AdminSession } from './authSession';

// In memory only, never in storage or a readable cookie: an XSS can use it at most while
// the page is open.
let currentSession: AdminSession | null = null;
let refreshHandler: (() => Promise<string | null>) | null = null;

export function setCurrentSession(session: AdminSession | null): void {
	currentSession = session;
}

export function getAccessToken(): string | null {
	return currentSession?.accessToken ?? null;
}

export function setRefreshHandler(handler: (() => Promise<string | null>) | null): void {
	refreshHandler = handler;
}

export function refreshAccessToken(): Promise<string | null> {
	return refreshHandler ? refreshHandler() : Promise.resolve(null);
}
