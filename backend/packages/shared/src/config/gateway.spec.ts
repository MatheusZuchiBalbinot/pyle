import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readGatewayConfig } from './gateway.js';

const GATEWAY_ENV_NAMES = [
	'GATEWAY_ID',
	'GATEWAY_PORT',
	'GATEWAY_ADMIN_PORT',
	'CONTROL_PLANE_DATABASE_URL',
	'CONTROL_PLANE_REDIS_URL',
	'GATEWAY_CONFIG_REFRESH_MS',
	'GATEWAY_METRICS_FLUSH_MS',
	'GATEWAY_HEARTBEAT_MS',
	'GATEWAY_MAX_REQUEST_TIMEOUT_MS',
	'REQUEST_LOG_MAX_ENTRIES',
	'REQUEST_LOG_SUCCESS_SAMPLE_RATE',
] as const;

describe('readGatewayConfig', () => {
	let originalEnv: Record<string, string | undefined>;

	beforeEach(() => {
		originalEnv = Object.fromEntries(GATEWAY_ENV_NAMES.map((name) => [name, process.env[name]]));

		for (const name of GATEWAY_ENV_NAMES) {
			delete process.env[name];
		}

		process.env.CONTROL_PLANE_DATABASE_URL = 'postgresql://localhost/control_plane';
		process.env.CONTROL_PLANE_REDIS_URL = 'redis://localhost:6379';
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

	it('applies the contract defaults', () => {
		const config = readGatewayConfig();

		expect(config).toMatchObject({
			port: 8080,
			adminPort: 8090,
			configRefreshMs: 30_000,
			metricsFlushMs: 10_000,
			heartbeatMs: 5000,
			maxRequestTimeoutMs: 60_000,
			requestLogMaxEntries: 1000,
			requestLogSuccessSampleRate: 0.2,
		});
		expect(config.gatewayId).toMatch(/^gw-.+-\d+$/);
	});

	it('uses an explicit gateway id', () => {
		process.env.GATEWAY_ID = 'gw-a';

		expect(readGatewayConfig().gatewayId).toBe('gw-a');
	});

	it('requires the database and Redis URLs', () => {
		delete process.env.CONTROL_PLANE_DATABASE_URL;

		expect(() => readGatewayConfig()).toThrow(/CONTROL_PLANE_DATABASE_URL/);
	});

	it('refuses a refresh interval that would hammer the database', () => {
		process.env.GATEWAY_CONFIG_REFRESH_MS = '100';

		expect(() => readGatewayConfig()).toThrow(/GATEWAY_CONFIG_REFRESH_MS/);
	});

	it('refuses a flush interval different from the bucket size', () => {
		process.env.GATEWAY_METRICS_FLUSH_MS = '5000';

		expect(() => readGatewayConfig()).toThrow(/GATEWAY_METRICS_FLUSH_MS/);
	});

	it('refuses an out-of-range sample rate', () => {
		process.env.REQUEST_LOG_SUCCESS_SAMPLE_RATE = '2';

		expect(() => readGatewayConfig()).toThrow(/REQUEST_LOG_SUCCESS_SAMPLE_RATE/);
	});
});
