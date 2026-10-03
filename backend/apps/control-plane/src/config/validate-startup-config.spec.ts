import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { validateStartupConfig } from './validate-startup-config.js';

const REQUIRED_ENV = {
	ADMIN_JWT_SECRET: 'a-secret-long-enough-for-the-config-check',
	ADMIN_API_TOKEN: 'service-token',
	CONTROL_PLANE_REDIS_URL: 'redis://localhost:6379',
	CENTRIFUGO_URL: 'http://localhost:8000',
	CENTRIFUGO_PUBLIC_URL: 'ws://localhost:8000/connection/websocket',
	CENTRIFUGO_API_KEY: 'api-key',
	CENTRIFUGO_TOKEN_HMAC_SECRET: 'token-secret',
} as const;

describe('validateStartupConfig', () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = Object.fromEntries([...Object.keys(REQUIRED_ENV), 'NODE_ENV'].map((key) => [key, process.env[key]]));
		Object.assign(process.env, REQUIRED_ENV);
	});

	afterEach(() => {
		for (const [key, value] of Object.entries(originalEnv)) {
			if (value === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = value;
			}
		}
	});

	it('passes when everything required is configured', () => {
		expect(() => validateStartupConfig()).not.toThrow();
	});

	// A missing secret must not surface later as every login answering 401.
	it('names the missing variable instead of letting it become a 401 later', () => {
		delete process.env.ADMIN_JWT_SECRET;

		expect(() => validateStartupConfig()).toThrow(/ADMIN_JWT_SECRET/);
	});

	it('rejects a secret that is present but too short to sign with', () => {
		process.env.ADMIN_JWT_SECRET = 'too-short';

		expect(() => validateStartupConfig()).toThrow(/at least 32 characters/);
	});

	it.each(['ADMIN_API_TOKEN', 'CONTROL_PLANE_REDIS_URL', 'CENTRIFUGO_URL'])('refuses to start without %s', (name) => {
		delete process.env[name];

		expect(() => validateStartupConfig()).toThrow(new RegExp(name));
	});

	it.each([
		['TRAFFIC_RETENTION_HOURS', '0'],
		['CONSUMER_PURGE_AFTER_DAYS', 'soon'],
		['ALERT_EVALUATION_INTERVAL_MS', '-1'],
	])('rejects an invalid %s', (name, value) => {
		process.env[name] = value;

		try {
			expect(() => validateStartupConfig()).toThrow(new RegExp(name));
		} finally {
			delete process.env[name];
		}
	});

	it('refuses chaos without a token', () => {
		process.env.CHAOS_ALLOWED = 'true';

		try {
			expect(() => validateStartupConfig()).toThrow(/DEMO_CHAOS_TOKEN/);
		} finally {
			delete process.env.CHAOS_ALLOWED;
		}
	});

	it('reports every problem at once, not just the first', () => {
		delete process.env.ADMIN_API_TOKEN;
		delete process.env.CONTROL_PLANE_REDIS_URL;

		const message = (() => {
			try {
				validateStartupConfig();

				return '';
			} catch (error) {
				return error instanceof Error ? error.message : '';
			}
		})();

		expect(message).toContain('ADMIN_API_TOKEN');
		expect(message).toContain('CONTROL_PLANE_REDIS_URL');
	});

	describe('example secrets', () => {
		it('refuses to start production with a secret still set to its .env.example value', () => {
			process.env.NODE_ENV = 'production';
			process.env.ADMIN_API_TOKEN = 'dev-admin-token-change-me';

			expect(() => validateStartupConfig()).toThrow(/ADMIN_API_TOKEN: still the value from \.env\.example/);
		});

		it('accepts the example values outside production, where they are what a fresh clone runs with', () => {
			process.env.NODE_ENV = 'development';
			process.env.ADMIN_API_TOKEN = 'dev-admin-token-change-me';

			expect(() => validateStartupConfig()).not.toThrow();
		});

		it('accepts real secrets in production', () => {
			process.env.NODE_ENV = 'production';

			expect(() => validateStartupConfig()).not.toThrow();
		});
	});
});
