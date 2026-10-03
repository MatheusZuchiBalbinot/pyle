import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PlatformSettingsService } from './platform-settings.service.js';

const MANAGED_ENV_KEYS = [
	'AI_MODEL',
	'AI_API_KEY',
	'CENTRIFUGO_URL',
	'CENTRIFUGO_PUBLIC_URL',
	'CENTRIFUGO_API_KEY',
	'CENTRIFUGO_TOKEN_HMAC_SECRET',
	'CONTROL_PLANE_DATABASE_URL',
	'CONTROL_PLANE_REDIS_URL',
] as const;

// The realtime settings are required at boot, so a running app always has
// them; the test supplies them the same way the environment would.
const CONSOLE_WEB_SOCKET_URL = 'ws://localhost:8000/connection/websocket';

describe('PlatformSettingsService', () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = Object.fromEntries(MANAGED_ENV_KEYS.map((key) => [key, process.env[key]]));
		process.env.CENTRIFUGO_URL = 'http://localhost:8000';
		process.env.CENTRIFUGO_PUBLIC_URL = CONSOLE_WEB_SOCKET_URL;
		process.env.CENTRIFUGO_API_KEY = 'api-key';
		process.env.CENTRIFUGO_TOKEN_HMAC_SECRET = 'token-secret';
		process.env.CONTROL_PLANE_DATABASE_URL = 'postgresql://localhost/control_plane';
		process.env.CONTROL_PLANE_REDIS_URL = 'redis://localhost:6379';
	});

	afterEach(() => {
		for (const key of MANAGED_ENV_KEYS) {
			if (originalEnv[key] === undefined) {
				delete process.env[key];
			} else {
				process.env[key] = originalEnv[key];
			}
		}
	});

	it('reports the AI integration as configured when both the model and the key are present', () => {
		process.env.AI_MODEL = 'claude-test';
		process.env.AI_API_KEY = 'sk-test';

		const settings = new PlatformSettingsService().getSettings();

		expect(settings.ai).toEqual({ provider: 'anthropic', isConfigured: true, modelId: 'claude-test' });
	});

	it('shows "not configured" instead of failing when the AI settings are absent', () => {
		delete process.env.AI_MODEL;
		delete process.env.AI_API_KEY;

		const settings = new PlatformSettingsService().getSettings();

		expect(settings.ai).toEqual({ provider: 'anthropic', isConfigured: false, modelId: null });
	});

	it('does not call itself configured on a model with no key behind it', () => {
		process.env.AI_MODEL = 'claude-test';
		delete process.env.AI_API_KEY;

		const settings = new PlatformSettingsService().getSettings();

		expect(settings.ai).toEqual({ provider: 'anthropic', isConfigured: false, modelId: 'claude-test' });
	});

	it('never exposes the API key itself, only whether one is set', () => {
		process.env.AI_MODEL = 'claude-test';
		process.env.AI_API_KEY = 'sk-super-secret';

		const serialized = JSON.stringify(new PlatformSettingsService().getSettings());

		expect(serialized).not.toContain('sk-super-secret');
	});

	it('returns the gateway and traffic settings the page shows', () => {
		const settings = new PlatformSettingsService().getSettings();

		expect(settings.systemHealthCheckIntervalMs).toBeGreaterThan(0);
		expect(settings.gateway).toEqual(expect.objectContaining({ port: 8080, adminPort: 8090, metricsFlushMs: 10_000 }));
		expect(settings.traffic).toEqual(expect.objectContaining({ retentionHours: 24, consumerPurgeAfterDays: 30, isChaosAllowed: false }));
	});

	it('says whether chaos is allowed, never the token', () => {
		process.env.CHAOS_ALLOWED = 'true';
		process.env.DEMO_CHAOS_TOKEN = 'a-chaos-token-long-enough';

		try {
			const settings = new PlatformSettingsService().getSettings();

			expect(settings.traffic.isChaosAllowed).toBe(true);
			expect(JSON.stringify(settings)).not.toContain('a-chaos-token-long-enough');
		} finally {
			delete process.env.CHAOS_ALLOWED;
			delete process.env.DEMO_CHAOS_TOKEN;
		}
	});

	it("returns the console's realtime endpoint", () => {
		const settings = new PlatformSettingsService().getSettings();

		expect(settings.realtime.consoleWebSocketUrl).toBe(CONSOLE_WEB_SOCKET_URL);
	});
});
