import type { CookieOptions, Request, Response } from 'express';

import { getIsSecureCookieRequired, getRefreshTokenTtlDays } from '../../config/admin-auth.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export const REFRESH_COOKIE_NAME = 'pyle_refresh';
// Scoped to the refresh/logout routes: no other request needs to carry
// the token, so no other request can leak it.
const REFRESH_COOKIE_PATH = '/admin/auth';

export function setRefreshCookie(response: Response, token: string): void {
	response.cookie(REFRESH_COOKIE_NAME, token, buildCookieOptions());
}

export function clearRefreshCookie(response: Response): void {
	response.clearCookie(REFRESH_COOKIE_NAME, { ...buildCookieOptions(), maxAge: undefined });
}

// One cookie on two routes is not worth another dependency.
export function readRefreshCookie(request: Request): string | null {
	const header = request.header('cookie');

	if (!header) {
		return null;
	}

	for (const part of header.split(';')) {
		const separatorIndex = part.indexOf('=');

		if (separatorIndex === -1) {
			continue;
		}

		const name = part.slice(0, separatorIndex).trim();

		if (name === REFRESH_COOKIE_NAME) {
			return decodeURIComponent(part.slice(separatorIndex + 1).trim());
		}
	}

	return null;
}

// httpOnly: an XSS can steal at most a short-lived access token. SameSite=Strict keeps it
// off cross-site requests.
function buildCookieOptions(): CookieOptions {
	return {
		httpOnly: true,
		secure: getIsSecureCookieRequired(),
		sameSite: 'strict',
		path: REFRESH_COOKIE_PATH,
		maxAge: getRefreshTokenTtlDays() * MS_PER_DAY,
	};
}
