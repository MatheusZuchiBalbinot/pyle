// Only that each reader wires the right variable and default; parsing is tested in env-
// parsing.spec.ts.
import { afterEach, describe, expect, it } from 'vitest';

import { getAdminApiToken } from './admin-api-token.js';
import { getAiApiKey, getAiModelId, getAiProvider } from './ai-provider.js';
import { getControlPlaneRedisUrl } from './control-plane-redis.js';
import { getSystemHealthCheckIntervalMs } from './system-health.js';
import { getAlertEvaluationIntervalMs, getConsumerPurgeAfterDays, getTrafficRetentionHours } from './traffic.js';

const MANAGED_ENV_VARS = [
	'ADMIN_API_TOKEN',
	'AI_API_KEY',
	'AI_MODEL',
	'AI_PROVIDER',
	'CONTROL_PLANE_REDIS_URL',
	'SYSTEM_HEALTH_CHECK_INTERVAL_MS',
	'TRAFFIC_RETENTION_HOURS',
	'CONSUMER_PURGE_AFTER_DAYS',
	'ALERT_EVALUATION_INTERVAL_MS',
] as const;

const originalValues = new Map(MANAGED_ENV_VARS.map((name) => [name, process.env[name]]));

afterEach(() => {
	for (const name of MANAGED_ENV_VARS) {
		const original = originalValues.get(name);

		if (original === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = original;
		}
	}
});

describe('required string env readers', () => {
	it('getAdminApiToken reads ADMIN_API_TOKEN', () => {
		process.env.ADMIN_API_TOKEN = 'a-token';
		expect(getAdminApiToken()).toBe('a-token');
	});

	it('getAiApiKey/getAiModelId read AI_API_KEY/AI_MODEL', () => {
		process.env.AI_API_KEY = 'sk-test';
		process.env.AI_MODEL = 'some-model';
		expect(getAiApiKey()).toBe('sk-test');
		expect(getAiModelId()).toBe('some-model');
	});

	it('getAiProvider defaults to anthropic and rejects unknown providers', () => {
		delete process.env.AI_PROVIDER;
		expect(getAiProvider()).toBe('anthropic');
		process.env.AI_PROVIDER = 'galaxy';
		expect(() => getAiProvider()).toThrow(/Unsupported AI_PROVIDER/);
	});

	it('getControlPlaneRedisUrl reads CONTROL_PLANE_REDIS_URL', () => {
		process.env.CONTROL_PLANE_REDIS_URL = 'redis://localhost:46379';
		expect(getControlPlaneRedisUrl()).toBe('redis://localhost:46379');
	});
});

describe('positive-int env readers fall back to their documented defaults', () => {
	it('traffic settings default to 24 h retention, 30-day consumer purge and 10 s alert evaluation', () => {
		delete process.env.TRAFFIC_RETENTION_HOURS;
		delete process.env.CONSUMER_PURGE_AFTER_DAYS;
		delete process.env.ALERT_EVALUATION_INTERVAL_MS;
		expect(getTrafficRetentionHours()).toBe(24);
		expect(getConsumerPurgeAfterDays()).toBe(30);
		expect(getAlertEvaluationIntervalMs()).toBe(10_000);
	});

	it('getSystemHealthCheckIntervalMs defaults to 10 seconds', () => {
		delete process.env.SYSTEM_HEALTH_CHECK_INTERVAL_MS;
		expect(getSystemHealthCheckIntervalMs()).toBe(10_000);
	});

	it('honors an explicit override over the default', () => {
		process.env.TRAFFIC_RETENTION_HOURS = '48';
		expect(getTrafficRetentionHours()).toBe(48);
	});
});
