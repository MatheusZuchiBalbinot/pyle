import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getScalingConfig } from './scaling.js';

afterEach(() => {
	vi.unstubAllEnvs();
});

describe('getScalingConfig', () => {
	it('is off unless enabled', () => {
		vi.stubEnv('SCALING_ALLOWED', '');
		expect(getScalingConfig()).toEqual({ isAllowed: false });
	});

	it('defaults to the repository demo service, localhost and 30 s', () => {
		vi.stubEnv('SCALING_ALLOWED', 'true');
		vi.stubEnv('DEMO_SERVICE_SOURCE_DIR', '');
		vi.stubEnv('INSTANCE_CONTAINER_HOST', '');
		vi.stubEnv('INSTANCE_RECONCILIATION_INTERVAL_MS', '');
		vi.stubEnv('DEMO_CHAOS_TOKEN', '');

		expect(getScalingConfig()).toEqual({
			isAllowed: true,
			demoServiceSourceDir: resolve('../infra/demo-service'),
			instanceHost: 'localhost',
			reconciliationIntervalMs: 30_000,
			chaosToken: null,
		});
	});

	it('reads every override', () => {
		vi.stubEnv('SCALING_ALLOWED', 'true');
		vi.stubEnv('DEMO_SERVICE_SOURCE_DIR', '/srv/demo');
		vi.stubEnv('INSTANCE_CONTAINER_HOST', 'host.docker.internal');
		vi.stubEnv('INSTANCE_RECONCILIATION_INTERVAL_MS', '5000');
		vi.stubEnv('DEMO_CHAOS_TOKEN', 'a-token-long-enough');

		expect(getScalingConfig()).toMatchObject({
			demoServiceSourceDir: '/srv/demo',
			instanceHost: 'host.docker.internal',
			reconciliationIntervalMs: 5000,
			chaosToken: 'a-token-long-enough',
		});
	});
});
