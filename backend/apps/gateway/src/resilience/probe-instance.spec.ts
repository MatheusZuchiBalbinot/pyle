import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UpstreamAgents } from '../proxy/upstream-agents.js';
import { buildInstance } from '../testing/build-test-snapshot.js';
import { startFakeUpstream, type FakeUpstream } from '../testing/fake-upstream.js';
import { createProbe } from './probe-instance.js';

const HEALTH = { path: '/health', intervalMs: 5000, timeoutMs: 100, healthyThreshold: 2, unhealthyThreshold: 3 };

describe('createProbe', () => {
	let upstream: FakeUpstream;
	const agents = new UpstreamAgents();
	let now = 0;
	const probe = createProbe({ agentFor: (instance, url) => agents.forInstance(instance.id, url), now: () => (now += 7) });

	beforeAll(async () => {
		upstream = await startFakeUpstream('a');
	});

	afterAll(async () => {
		agents.destroyAll();
		await upstream.close();
	});

	function check(url: string = upstream.url) {
		return probe({ instance: buildInstance('a', { url }), healthCheck: HEALTH });
	}

	it('succeeds on 2xx, asking the health path', async () => {
		upstream.setBehavior({ kind: 'echo' });

		expect(await check()).toEqual({ isSuccess: true, latencyMs: 7, detail: 'HTTP 200' });
		expect(upstream.received.at(-1)).toMatchObject({ method: 'GET', url: '/health' });
	});

	it('fails on any other status, naming it', async () => {
		upstream.setBehavior({ kind: 'status', status: 503 });

		expect(await check()).toMatchObject({ isSuccess: false, detail: 'HTTP 503' });
	});

	it('fails on a timeout', async () => {
		upstream.setBehavior({ kind: 'delay', delayMs: 400 });

		expect(await check()).toMatchObject({ isSuccess: false, detail: 'timeout' });
	});

	it('fails on a refused connection, naming the code', async () => {
		expect(await check('http://127.0.0.1:1')).toMatchObject({ isSuccess: false, detail: 'ECONNREFUSED' });
	});
});
