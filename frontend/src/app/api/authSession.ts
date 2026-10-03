import type { AdminUser } from './adminApiTypes';
import { getAdminApiBaseUrl } from './runtimeConfig';

const ADMIN_API_BASE_URL = getAdminApiBaseUrl();
const AUTH_BASE_PATH = '/admin/auth';
// Refresh a little before the token actually dies, so a request never
// races the expiry it was checked against.
const REFRESH_MARGIN_MS = 60_000;

export type AdminSession = {
	readonly accessToken: string;
	readonly expiresAt: string;
	readonly user: AdminUser;
};

type ErrorBody = { readonly message?: string | readonly string[] };

// The refresh token rotates on every use, and presenting a used one again revokes the whole
// session (reuse detection). Two refreshes at once (the session restore on load, run twice
// by React's StrictMode, or a restore and a 401 retry) would log the user out, so every
// caller shares the one in flight.
let inFlightRefresh: Promise<AdminSession> | null = null;

export class AuthError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = 'AuthError';
		this.statusCode = statusCode;
	}
}

export async function login(email: string, password: string): Promise<AdminSession> {
	const response = await postToAuth('/login', { email, password });

	return (await response.json()) as AdminSession;
}

// A 401 here just means there is no session.
export function refreshSession(): Promise<AdminSession> {
	inFlightRefresh ??= requestRefresh().finally(() => {
		inFlightRefresh = null;
	});

	return inFlightRefresh;
}

export async function logout(): Promise<void> {
	await postToAuth('/logout');
}

export function millisecondsUntilRefresh(expiresAt: string): number {
	const remaining = Date.parse(expiresAt) - Date.now() - REFRESH_MARGIN_MS;

	return Math.max(remaining, 0);
}

async function requestRefresh(): Promise<AdminSession> {
	const response = await postToAuth('/refresh');

	return (await response.json()) as AdminSession;
}

async function readErrorMessage(response: Response): Promise<string> {
	const body = (await response.json().catch(() => null)) as ErrorBody | null;
	const message = body?.message;

	if (message === undefined) {
		return response.statusText;
	}

	if (typeof message === 'string') {
		return message;
	}

	return message.join(', ');
}

// The refresh cookie is httpOnly and the API is cross-origin in dev, so every call sends
// credentials.
async function postToAuth(path: string, body?: unknown): Promise<Response> {
	const init: RequestInit = {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	};
	const response = await fetch(`${ADMIN_API_BASE_URL}${AUTH_BASE_PATH}${path}`, init);

	if (!response.ok) {
		throw new AuthError(await readErrorMessage(response), response.status);
	}

	return response;
}
