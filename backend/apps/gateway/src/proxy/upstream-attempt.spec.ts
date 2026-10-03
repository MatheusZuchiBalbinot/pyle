import type { IncomingMessage } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startFakeUpstream, type FakeUpstream } from '../testing/fake-upstream.js';
import { UpstreamAgents } from './upstream-agents.js';
import { sendAttempt } from './upstream-attempt.js';

describe('sendAttempt', () => {
	let upstream: FakeUpstream;
	const agents = new UpstreamAgents();

	beforeAll(async () => {
		upstream = await startFakeUpstream('a');
	});

	afterAll(async () => {
		agents.destroyAll();
		await upstream.close();
	});

	function attempt(options: { readonly timeoutMs?: number; readonly url?: string; readonly signal?: AbortSignal } = {}) {
		const url = new URL(`${options.url ?? upstream.url}/path?x=1`);

		return sendAttempt({
			target: { url, headers: { 'x-test': '1' } },
			method: 'GET',
			agent: agents.forInstance(url.host, url),
			timeoutMs: options.timeoutMs ?? 1000,
			body: null,
			signal: options.signal ?? new AbortController().signal,
		});
	}

	it('hands the response back unread', async () => {
		upstream.setBehavior({ kind: 'status', status: 503 });

		const result = await attempt();

		expect(result.kind).toBe('response');
		const response = (result as { readonly response: IncomingMessage }).response;

		expect(response.statusCode).toBe(503);
		response.resume();
		expect(upstream.received.at(-1)).toMatchObject({ url: '/path?x=1', headers: expect.objectContaining({ 'x-test': '1' }) });
	});

	it('reports a timeout', async () => {
		upstream.setBehavior({ kind: 'delay', delayMs: 300 });

		expect(await attempt({ timeoutMs: 50 })).toEqual({ kind: 'timeout' });
	});

	it('reports a refused connection by its code', async () => {
		expect(await attempt({ url: 'http://127.0.0.1:1' })).toEqual({ kind: 'connection_error', errorCode: 'ECONNREFUSED' });
	});

	it('reports a client that went away', async () => {
		upstream.setBehavior({ kind: 'delay', delayMs: 300 });
		const controller = new AbortController();

		const pending = attempt({ signal: controller.signal });

		controller.abort();

		expect(await pending).toEqual({ kind: 'aborted' });
	});
});
