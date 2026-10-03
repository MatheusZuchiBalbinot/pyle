import { describe, expect, it, vi } from 'vitest';

import { buildInstanceTools, type InstanceToolDependencies } from './instance-tools.js';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const SERVICE = {
	slug: 'orders',
	name: 'Pedidos',
	lbStrategy: 'round_robin',
	timeoutMs: 1000,
	retryMaxAttempts: 2,
	healthCheck: {},
	circuit: {},
	routeCount: 1,
	instances: [
		{
			id: 'i1',
			name: 'orders-1',
			url: 'http://x',
			weight: 1,
			isEnabled: true,
			live: { health: 'healthy', circuit: 'closed', inFlight: 2, consecutiveFailures: 0 },
			chaos: null,
		},
		{ id: 'i2', name: 'orders-2', url: 'http://y', weight: 1, isEnabled: false, live: null, chaos: { latencyMs: 800 } },
	],
};

function build() {
	const dependencies = {
		services: { get: vi.fn().mockResolvedValue(SERVICE) },
		traffic: {
			service: vi.fn().mockResolvedValue({
				instances: [
					{
						instanceId: 'i1',
						share: 1,
						totals: {
							requestCount: 5,
							requestsPerSecond: 1,
							errorRate: 0,
							clientErrorRate: 0,
							rateLimitedCount: 0,
							p50Ms: 1,
							p95Ms: 2,
							p99Ms: 3,
							retryCount: 0,
						},
					},
				],
			}),
		},
		stateEvents: {
			listSince: vi.fn().mockResolvedValue([
				{
					instanceId: 'i2',
					occurredAt: new Date(NOW - 1000),
					kind: 'health',
					fromState: 'healthy',
					toState: 'unhealthy',
					reason: 'r',
					gatewayId: 'gw',
				},
			]),
		},
		names: { instances: vi.fn().mockResolvedValue(new Map([['i2', { name: 'orders-2', serviceSlug: 'orders' }]])) },
		now: () => NOW,
	} as unknown as InstanceToolDependencies;

	return { tools: buildInstanceTools(dependencies), dependencies };
}

describe('instance tools', () => {
	it('describes a service and each instance, unknown state included', async () => {
		const result = JSON.parse(await build().tools[0].run({ serviceSlug: 'orders' }));

		expect(result.service).toMatchObject({ slug: 'orders', lbStrategy: 'round_robin' });
		expect(result.instances).toEqual([
			expect.objectContaining({ name: 'orders-1', health: 'healthy', inFlight: 2, sharePct15m: 100 }),
			expect.objectContaining({
				name: 'orders-2',
				isEnabled: false,
				health: 'unknown',
				circuit: 'unknown',
				sharePct15m: 0,
				last15m: null,
				chaos: { latencyMs: 800 },
			}),
		]);
		await expect(build().tools[0].run({})).rejects.toThrow('serviceSlug is required');
	});

	it('lists health events for one service or all, within the asked minutes', async () => {
		const { tools, dependencies } = build();

		const events = JSON.parse(await tools[1].run({ serviceSlug: 'orders', sinceMinutes: 30 }));

		await tools[1].run({});

		expect(events).toEqual([expect.objectContaining({ instance: 'orders/orders-2', to: 'unhealthy' })]);
		expect(dependencies.stateEvents.listSince).toHaveBeenNthCalledWith(1, new Date(NOW - 30 * 60_000), ['i1', 'i2'], 50);
		expect(dependencies.stateEvents.listSince).toHaveBeenNthCalledWith(2, new Date(NOW - 60 * 60_000), null, 50);
		await expect(tools[1].run({ sinceMinutes: 5000 })).rejects.toThrow('between 1 and 1440');
	});
});
