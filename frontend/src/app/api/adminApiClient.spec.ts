import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCurrentSession, setRefreshHandler } from './accessTokenStore';
import {
	AdminApiError,
	askAiAnalysis,
	createService,
	listAdminNotifications,
	listAiAnalyses,
	listServices,
	markAllNotificationsRead,
	updateInstance,
	updateService,
} from './adminApiClient';

const API_BASE_URL = 'http://localhost:3000';
const ACCESS_TOKEN = 'access-token';
const REFRESHED_TOKEN = 'refreshed-token';
const SESSION_USER = { id: 'u1', email: 'ops@pyle.local', name: 'Ops', lastLoginAt: null };

type FetchStub = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200, headers: HeadersInit = {}): Response {
	return { ok: status < 400, status, statusText: 'OK', headers: new Headers(headers), json: () => Promise.resolve(body) } as Response;
}

function errorResponse(body: unknown, status: number, statusText = 'Error'): Response {
	return { ok: false, status, statusText, json: () => Promise.resolve(body) } as Response;
}

function installFetch(...responses: readonly Response[]): FetchStub {
	const fetchStub = vi.fn();

	for (const response of responses) {
		fetchStub.mockResolvedValueOnce(response);
	}

	// Anything beyond the scripted responses is a mistake in the test.
	fetchStub.mockResolvedValue(jsonResponse([]));
	globalThis.fetch = fetchStub as unknown as typeof fetch;

	return fetchStub;
}

function urlOf(fetchStub: FetchStub, callIndex: number): string {
	return (fetchStub.mock.calls[callIndex] as [string])[0];
}

function initOf(fetchStub: FetchStub, callIndex: number): RequestInit {
	return (fetchStub.mock.calls[callIndex] as [string, RequestInit])[1];
}

function headersOf(fetchStub: FetchStub, callIndex: number): Headers {
	return new Headers(initOf(fetchStub, callIndex).headers);
}

describe('adminApiClient', () => {
	beforeEach(() => {
		setCurrentSession({ accessToken: ACCESS_TOKEN, expiresAt: '2026-03-01T10:15:00.000Z', user: SESSION_USER });
		setRefreshHandler(null);
	});

	afterEach(() => {
		setCurrentSession(null);
		setRefreshHandler(null);
		vi.restoreAllMocks();
	});

	describe('authorization', () => {
		it('carries the access token on every call', async () => {
			const fetchStub = installFetch(jsonResponse([]));

			await listServices();

			expect(headersOf(fetchStub, 0).get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
		});

		it('sends no Authorization header when there is no session, rather than the word null', async () => {
			setCurrentSession(null);
			const fetchStub = installFetch(jsonResponse([]));

			await listServices();

			expect(headersOf(fetchStub, 0).has('Authorization')).toBe(false);
		});

		it('refreshes once on a 401 and replays the request with the new token', async () => {
			const fetchStub = installFetch(errorResponse({}, 401), jsonResponse([{ slug: 'orders' }]));

			setRefreshHandler(() => Promise.resolve(REFRESHED_TOKEN));

			const services = await listServices();

			expect(fetchStub).toHaveBeenCalledTimes(2);
			expect(headersOf(fetchStub, 1).get('Authorization')).toBe(`Bearer ${REFRESHED_TOKEN}`);
			expect(services).toEqual([{ slug: 'orders' }]);
		});

		it('surfaces the 401 when the refresh fails, which is what sends the console back to the login screen', async () => {
			installFetch(errorResponse({ message: 'Unauthorized' }, 401));
			setRefreshHandler(() => Promise.resolve(null));

			await expect(listServices()).rejects.toMatchObject({ name: 'AdminApiError', statusCode: 401 });
		});

		it('does not retry a second time when the replayed request is rejected too', async () => {
			const fetchStub = installFetch(errorResponse({}, 401), errorResponse({ message: 'Still no' }, 403));

			setRefreshHandler(() => Promise.resolve(REFRESHED_TOKEN));

			await expect(listServices()).rejects.toMatchObject({ statusCode: 403, message: 'Still no' });
			expect(fetchStub).toHaveBeenCalledTimes(2);
		});

		it('keeps the caller headers whatever form they were given in', async () => {
			const fetchStub = installFetch(jsonResponse(null));

			await updateService('orders', { timeoutMs: 2000 });

			expect(headersOf(fetchStub, 0).get('Content-Type')).toBe('application/json');
			expect(headersOf(fetchStub, 0).get('Authorization')).toBe(`Bearer ${ACCESS_TOKEN}`);
		});

		it('leaves a 403 alone: it is a permission problem, not an expired token', async () => {
			const fetchStub = installFetch(errorResponse({ message: 'Forbidden' }, 403));
			const refreshHandler = vi.fn().mockResolvedValue(REFRESHED_TOKEN);

			setRefreshHandler(refreshHandler);

			await expect(listServices()).rejects.toThrow('Forbidden');
			expect(refreshHandler).not.toHaveBeenCalled();
			expect(fetchStub).toHaveBeenCalledTimes(1);
		});
	});

	describe('errors', () => {
		it('reports the API message', async () => {
			installFetch(errorResponse({ message: 'Service not found' }, 404));

			await expect(updateService('ghost', {})).rejects.toThrow('Service not found');
		});

		it('joins the field-by-field validation messages into one line', async () => {
			installFetch(errorResponse({ message: ['slug is invalid', 'name is required'] }, 400));

			await expect(createService({ name: '', slug: '!' })).rejects.toThrow('slug is invalid, name is required');
		});

		it('falls back to the status text when the body carries no message', async () => {
			installFetch(errorResponse({}, 500, 'Internal Server Error'));

			await expect(listServices()).rejects.toThrow('Internal Server Error');
		});

		it('is an Error subclass carrying the status code', () => {
			const error = new AdminApiError('boom', 409);

			expect(error).toBeInstanceOf(Error);
			expect(error.statusCode).toBe(409);
		});
	});

	describe('request de-duplication', () => {
		it('shares one in-flight GET between concurrent callers instead of hitting the API twice', async () => {
			let resolveResponse: ((response: Response) => void) | undefined;
			const pending = new Promise<Response>((resolve) => {
				resolveResponse = resolve;
			});
			const fetchStub = vi.fn().mockReturnValue(pending);

			globalThis.fetch = fetchStub as unknown as typeof fetch;

			const both = Promise.all([listServices(), listServices()]);

			resolveResponse?.(jsonResponse([{ slug: 'orders' }]));
			const [first, second] = await both;

			expect(fetchStub).toHaveBeenCalledTimes(1);
			expect(first).toEqual(second);
		});

		it('issues a fresh request once the previous one settled, so nothing is served stale', async () => {
			const fetchStub = installFetch(jsonResponse([{ slug: 'orders' }]), jsonResponse([{ slug: 'orders' }, { slug: 'users' }]));

			await listServices();
			const second = await listServices();

			expect(fetchStub).toHaveBeenCalledTimes(2);
			expect(second).toHaveLength(2);
		});

		it('never de-duplicates a write, which is not safe to share', async () => {
			const fetchStub = installFetch(jsonResponse(null), jsonResponse(null));

			await Promise.all([markAllNotificationsRead(), markAllNotificationsRead()]);

			expect(fetchStub).toHaveBeenCalledTimes(2);
		});
	});

	describe('paths and queries', () => {
		it('escapes a slug instead of letting it reshape the path', async () => {
			const fetchStub = installFetch(jsonResponse({}));

			await updateService('../admin/settings', {});

			expect(urlOf(fetchStub, 0)).toBe(`${API_BASE_URL}/admin/services/..%2Fadmin%2Fsettings`);
		});

		it('sends no query at all when no filter and no page were given', async () => {
			const fetchStub = installFetch(jsonResponse({ items: [], nextCursor: null }));

			await listAiAnalyses({});

			expect(urlOf(fetchStub, 0)).toBe(`${API_BASE_URL}/admin/ai/analyses`);
		});

		it('carries the filter and the cursor page together', async () => {
			const fetchStub = installFetch(jsonResponse({ items: [], nextCursor: null }));

			await listAiAnalyses({ scope: 'route', subjectId: 'r1' }, { cursor: 'abc', limit: 20 });

			expect(urlOf(fetchStub, 0)).toBe(`${API_BASE_URL}/admin/ai/analyses?scope=route&subjectId=r1&cursor=abc&limit=20`);
		});

		it('carries the notification filters and its page in one query', async () => {
			const fetchStub = installFetch(jsonResponse({ items: [], nextCursor: null, unreadCount: 0 }));

			await listAdminNotifications({ category: 'traffic', read: 'unread', limit: 10 });

			expect(urlOf(fetchStub, 0)).toBe(`${API_BASE_URL}/admin/notifications?category=traffic&read=unread&limit=10`);
		});

		it('sends a service change as a PATCH with the changed fields only', async () => {
			const fetchStub = installFetch(jsonResponse({}));

			await updateService('orders', { lbStrategy: 'weighted_random' });

			expect(urlOf(fetchStub, 0)).toBe(`${API_BASE_URL}/admin/services/orders`);
			expect(initOf(fetchStub, 0)).toEqual(expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ lbStrategy: 'weighted_random' }) }));
		});
	});

	describe('instance updates', () => {
		it('passes the drained-last-instance warning through', async () => {
			installFetch(jsonResponse({ id: 'i1' }, 200, { 'x-pyle-warning': 'service-has-no-enabled-instance' }));

			const result = await updateInstance('orders', 'i1', { isEnabled: false });

			expect(result).toEqual({ instance: { id: 'i1' }, warning: 'service-has-no-enabled-instance' });
		});

		it.each([
			['no header', {}],
			['an unknown warning', { 'x-pyle-warning': 'something-else' }],
		])('reports no warning with %s', async (_label, headers) => {
			installFetch(jsonResponse({ id: 'i1' }, 200, headers));

			expect((await updateInstance('orders', 'i1', { weight: 3 })).warning).toBeNull();
		});
	});

	describe('streamed AI replies', () => {
		function streamResponse(chunks: readonly string[]): Response {
			const encoder = new TextEncoder();
			let index = 0;
			const reader = {
				read: () => {
					if (index >= chunks.length) {
						return Promise.resolve({ value: undefined, done: true });
					}

					const value = encoder.encode(chunks[index]);

					index += 1;

					return Promise.resolve({ value, done: false });
				},
			};

			return { ok: true, status: 200, statusText: 'OK', body: { getReader: () => reader } } as unknown as Response;
		}

		async function collect(analysisId: string): Promise<readonly unknown[]> {
			const events: unknown[] = [];

			for await (const event of askAiAnalysis(analysisId, 'por quê?')) {
				events.push(event);
			}

			return events;
		}

		it('yields each event of the stream in order', async () => {
			installFetch(streamResponse(['event: text\ndata: {"type":"text","delta":"Oi"}\n\nevent: done\ndata: {"type":"done","text":"Oi"}\n\n']));

			const events = await collect('a1');

			expect(events).toEqual([
				{ type: 'text', delta: 'Oi' },
				{ type: 'done', text: 'Oi' },
			]);
		});

		it('waits for the rest of a frame that arrived split across chunks', async () => {
			installFetch(streamResponse(['event: text\ndata: {"type":"te', 'xt","delta":"Oi"}\n\n']));

			const events = await collect('a1');

			expect(events).toEqual([{ type: 'text', delta: 'Oi' }]);
		});

		it('ignores a frame carrying no data line', async () => {
			installFetch(streamResponse([': keep-alive\n\nevent: text\ndata: {"type":"text","delta":"Oi"}\n\n']));

			const events = await collect('a1');

			expect(events).toEqual([{ type: 'text', delta: 'Oi' }]);
		});

		it('fails clearly when the response carries no stream at all', async () => {
			installFetch({ ok: true, status: 200, statusText: 'OK', body: null } as Response);

			await expect(collect('a1')).rejects.toThrow('Empty response');
		});
	});
});
