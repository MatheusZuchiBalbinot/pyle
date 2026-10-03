import { afterEach, describe, expect, it, vi } from 'vitest';

import { CentrifugoApiError, CentrifugoNodeClient, type CentrifugoNode } from './centrifugo-node-client.js';

const NODE: CentrifugoNode = { apiUrl: 'http://localhost:48000', apiKey: 'node-api-key' };
const REQUEST_TIMEOUT_MS = 3000;

function jsonResponse(body: unknown, init: { ok?: boolean; status?: number } = {}): Response {
	return { ok: init.ok ?? true, status: init.status ?? 200, json: () => Promise.resolve(body) } as Response;
}

function stubFetch(response: Response | Error): ReturnType<typeof vi.fn> {
	const fetchStub = response instanceof Error ? vi.fn().mockRejectedValue(response) : vi.fn().mockResolvedValue(response);

	vi.stubGlobal('fetch', fetchStub);

	return fetchStub;
}

describe('CentrifugoNodeClient', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
	});

	describe('publish', () => {
		it('posts to the node own API with its own key', async () => {
			const fetchStub = stubFetch(jsonResponse({ result: {} }));

			await new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', { hello: 'world' });

			const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];

			expect(url).toBe(`${NODE.apiUrl}/api/publish`);
			expect(init.method).toBe('POST');
			expect((init.headers as Record<string, string>)['X-API-Key']).toBe(NODE.apiKey);
			expect(init.body).toBe(JSON.stringify({ channel: 'app:acme:chat', data: { hello: 'world' } }));
		});

		it('gives the request a deadline', async () => {
			const fetchStub = stubFetch(jsonResponse({ result: {} }));
			const timeoutSpy = vi.spyOn(AbortSignal, 'timeout');

			await new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', {});

			expect(timeoutSpy).toHaveBeenCalledWith(REQUEST_TIMEOUT_MS);
			expect(fetchStub).toHaveBeenCalled();
		});

		it('reports an unreachable node as a Centrifugo failure, not a raw fetch error', async () => {
			stubFetch(new TypeError('connect ECONNREFUSED'));

			await expect(new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', {})).rejects.toThrow(CentrifugoApiError);
		});

		it('names the node and the method in the failure, so a log line is enough to find it', async () => {
			stubFetch(new TypeError('connect ECONNREFUSED'));

			await expect(new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', {})).rejects.toThrow(
				`Centrifugo publish at ${NODE.apiUrl} failed: connect ECONNREFUSED`,
			);
		});

		it('reports the API own error message when the node rejects the call', async () => {
			stubFetch(jsonResponse({ error: { code: 102, message: 'unknown channel' } }));

			await expect(new CentrifugoNodeClient().publish(NODE, 'nope', {})).rejects.toThrow(
				`Centrifugo publish at ${NODE.apiUrl} rejected: unknown channel`,
			);
		});

		it('falls back to the status code when a rejection carries no body', async () => {
			stubFetch(jsonResponse({}, { ok: false, status: 401 }));

			await expect(new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', {})).rejects.toThrow(
				`Centrifugo publish at ${NODE.apiUrl} rejected: 401`,
			);
		});

		it('treats a body that is not JSON the same way', async () => {
			const unreadable = { ok: false, status: 502, json: () => Promise.reject(new Error('not json')) } as Response;

			stubFetch(unreadable);

			await expect(new CentrifugoNodeClient().publish(NODE, 'app:acme:chat', {})).rejects.toThrow('rejected: 502');
		});
	});
});
