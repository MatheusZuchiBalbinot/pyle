import { getAccessToken, refreshAccessToken } from '../accessTokenStore';
import type { PageQuery } from '../adminApiTypes';
import { getAdminApiBaseUrl } from '../runtimeConfig';

type ErrorResponseBody = {
	readonly message?: string | readonly string[];
};

export class AdminApiError extends Error {
	readonly statusCode: number;

	constructor(message: string, statusCode: number) {
		super(message);
		this.name = 'AdminApiError';
		this.statusCode = statusCode;
	}
}

const ADMIN_API_BASE_URL = getAdminApiBaseUrl();

const UNAUTHORIZED_STATUS = 401;

// Identical GETs in flight share one response: a realtime event often makes several views
// refetch the same resource.
const inFlightGetByPath = new Map<string, Promise<unknown>>();

// One retry, only on a 401: the short-lived token most likely expired between two clicks.
export function appendPageQuery(params: URLSearchParams, page: PageQuery): void {
	if (page.cursor) {
		params.set('cursor', page.cursor);
	}

	if (page.limit !== undefined) {
		params.set('limit', String(page.limit));
	}
}

export async function request(path: string, init?: RequestInit): Promise<Response> {
	const response = await fetch(`${ADMIN_API_BASE_URL}${path}`, buildRequestInit(init, getAccessToken()));

	if (response.status === UNAUTHORIZED_STATUS) {
		const refreshedToken = await refreshAccessToken();

		if (refreshedToken) {
			const retried = await fetch(`${ADMIN_API_BASE_URL}${path}`, buildRequestInit(init, refreshedToken));

			if (!retried.ok) {
				throw new AdminApiError(await parseErrorMessage(retried), retried.status);
			}

			return retried;
		}
	}

	if (!response.ok) {
		throw new AdminApiError(await parseErrorMessage(response), response.status);
	}

	return response;
}

export function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const isGet = init?.method === undefined || init.method === 'GET';

	if (!isGet) {
		return fetchJson<T>(path, init);
	}

	const inFlight = inFlightGetByPath.get(path);

	if (inFlight) {
		return inFlight as Promise<T>;
	}

	const settle = (): void => {
		inFlightGetByPath.delete(path);
	};

	const pending = fetchJson<T>(path, init).finally(settle);

	inFlightGetByPath.set(path, pending);

	return pending;
}

export async function requestNoContent(path: string, init?: RequestInit): Promise<void> {
	await request(path, init);
}

export function toQuery(params: URLSearchParams): string {
	return params.size > 0 ? `?${params.toString()}` : '';
}

export function jsonBody(method: 'POST' | 'PUT' | 'PATCH', body: unknown): RequestInit {
	return { method, body: JSON.stringify(body) };
}

function isStringArray(value: string | readonly string[]): value is readonly string[] {
	return Array.isArray(value);
}

async function parseErrorMessage(response: Response): Promise<string> {
	const body = (await response.json().catch(() => null)) as ErrorResponseBody | null;

	if (!body?.message) {
		return response.statusText;
	}

	return isStringArray(body.message) ? body.message.join(', ') : body.message;
}

function buildRequestInit(init: RequestInit | undefined, accessToken: string | null): RequestInit {
	// Through Headers, not a spread: spreading a Headers instance or an array of pairs
	// yields an empty object and drops Authorization.
	const headers = new Headers(init?.headers);

	headers.set('Content-Type', 'application/json');

	if (accessToken) {
		headers.set('Authorization', `Bearer ${accessToken}`);
	}

	return { ...init, headers };
}

function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
	return request(path, init).then((response) => response.json() as Promise<T>);
}
