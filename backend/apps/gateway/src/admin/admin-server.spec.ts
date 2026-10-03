import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { createAdminServer, resolveReadiness, type AdminServerOptions } from './admin-server.js';

const CONFIG_VERSION = 1_790_000_000_000;

describe('resolveReadiness', () => {
	it('is not ready without a configuration to serve from', () => {
		expect(resolveReadiness({ config: 'down', redis: 'up', postgres: 'up' })).toBe('not_ready');
	});

	it('is degraded, not unready, when a dependency is away but the snapshot is loaded', () => {
		expect(resolveReadiness({ config: 'up', redis: 'up', postgres: 'down' })).toBe('degraded');
		expect(resolveReadiness({ config: 'up', redis: 'down', postgres: 'up' })).toBe('degraded');
	});

	it('is ready with everything up', () => {
		expect(resolveReadiness({ config: 'up', redis: 'up', postgres: 'up' })).toBe('ready');
	});
});

describe('admin server readiness', () => {
	let close: (() => Promise<void>) | null = null;

	afterEach(async () => {
		await close?.();
		close = null;
	});

	async function readyResponse(overrides: Partial<AdminServerOptions>): Promise<Response> {
		const options: AdminServerOptions = {
			gatewayId: 'gw-test',
			startedAtMs: 0,
			now: () => 0,
			configVersion: () => CONFIG_VERSION,
			pingRedis: () => Promise.resolve('PONG'),
			pingPostgres: () => Promise.resolve(1),
			renderMetrics: () => '',
			...overrides,
		};
		const server = createAdminServer(options);

		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		close = () => new Promise((resolve) => server.close(() => resolve()));
		const { port } = server.address() as AddressInfo;

		return fetch(`http://127.0.0.1:${port}/health/ready`);
	}

	it('stays in the load balancer (200) through a Postgres outage, saying what is down', async () => {
		const response = await readyResponse({ pingPostgres: () => Promise.reject(new Error('connection refused')) });

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ status: 'degraded', checks: { config: 'up', redis: 'up', postgres: 'down' } });
	});

	it('answers 503 before the first configuration is loaded', async () => {
		const response = await readyResponse({ configVersion: () => null });

		expect(response.status).toBe(503);
		expect(await response.json()).toMatchObject({ status: 'not_ready' });
	});
});
