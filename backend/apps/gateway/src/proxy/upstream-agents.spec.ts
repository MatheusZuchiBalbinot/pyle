import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { describe, expect, it } from 'vitest';

import { UpstreamAgents } from './upstream-agents.js';

describe('UpstreamAgents', () => {
	it('keeps one keep-alive agent per instance, of the right protocol', () => {
		const agents = new UpstreamAgents();

		const http = agents.forInstance('a', new URL('http://x'));
		const https = agents.forInstance('b', new URL('https://y'));

		expect(agents.forInstance('a', new URL('http://x'))).toBe(http);
		expect(http).toBeInstanceOf(HttpAgent);
		expect(https).toBeInstanceOf(HttpsAgent);
	});

	it('destroys the agents of instances that are gone', () => {
		const agents = new UpstreamAgents();

		agents.forInstance('a', new URL('http://x'));
		agents.forInstance('b', new URL('http://y'));

		agents.retainOnly(new Set(['b']));
		expect(agents.size).toBe(1);

		agents.destroyAll();
		expect(agents.size).toBe(0);
	});
});
