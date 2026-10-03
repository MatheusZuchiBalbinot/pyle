import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getChaosConfig } from './chaos.js';

describe('getChaosConfig', () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = { CHAOS_ALLOWED: process.env.CHAOS_ALLOWED, DEMO_CHAOS_TOKEN: process.env.DEMO_CHAOS_TOKEN };
		delete process.env.CHAOS_ALLOWED;
		delete process.env.DEMO_CHAOS_TOKEN;
	});

	afterEach(() => {
		for (const [name, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = value;
			}
		}
	});

	it('is off by default and needs no token then', () => {
		expect(getChaosConfig()).toEqual({ isAllowed: false });
	});

	it('carries the token when allowed', () => {
		process.env.CHAOS_ALLOWED = 'true';
		process.env.DEMO_CHAOS_TOKEN = 'a-demo-token-long-enough';

		expect(getChaosConfig()).toEqual({ isAllowed: true, token: 'a-demo-token-long-enough' });
	});

	it('requires a token when allowed', () => {
		process.env.CHAOS_ALLOWED = 'true';

		expect(() => getChaosConfig()).toThrow(/DEMO_CHAOS_TOKEN/);
	});

	it('refuses a short token', () => {
		process.env.CHAOS_ALLOWED = 'true';
		process.env.DEMO_CHAOS_TOKEN = 'short';

		expect(() => getChaosConfig()).toThrow(/at least 16/);
	});
});
