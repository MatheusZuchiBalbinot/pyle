import { describe, expect, it, vi } from 'vitest';

import { ConfigNotFoundError } from '../../../gateway-config/domain/config-errors.js';
import type { AiTool } from '../ai-tool.js';
import { buildTrafficTools, type TrafficToolDependencies } from './traffic-tools.js';

const TOTALS = {
	requestCount: 100,
	requestsPerSecond: 1.5,
	errorRate: 0.02,
	clientErrorRate: 0,
	rateLimitedCount: 0,
	p50Ms: 10,
	p95Ms: 50,
	p99Ms: 90,
	retryCount: 0,
};
const WINDOW = { from: 'a', to: 'b', stepSeconds: 60 };
const POINTS = Array.from({ length: 60 }, (_value, index) => ({
	at: `t${index}`,
	requestsPerSecond: 1,
	errorRate: 0,
	rateLimitedCount: 0,
	p50Ms: 1,
	p95Ms: 2,
	p99Ms: 3,
}));
const ROUTE = {
	id: 'r1',
	name: 'Pedidos',
	pathPrefix: '/api/orders',
	service: { slug: 'orders' },
	stripPrefix: true,
	methods: [],
	isAuthRequired: true,
	rateLimitPerMinute: null,
	timeoutMs: null,
};

function build(): { readonly tools: readonly AiTool[]; readonly dependencies: TrafficToolDependencies } {
	const dependencies = {
		traffic: {
			overview: vi.fn().mockResolvedValue({
				window: WINDOW,
				totals: TOTALS,
				series: POINTS,
				routes: [
					{ routeId: 'r1', name: 'Pedidos', pathPrefix: '/api/orders', totals: { ...TOTALS, errorRate: 0.01 } },
					{ routeId: 'r2', name: 'Usuários', pathPrefix: '/api/users', totals: { ...TOTALS, errorRate: 0.5 } },
					{ routeId: 'r3', name: 'Quieta', pathPrefix: '/api/quiet', totals: { ...TOTALS, requestCount: 0 } },
				],
				topConsumers: [],
			}),
			route: vi.fn().mockResolvedValue({
				route: ROUTE,
				window: WINDOW,
				totals: TOTALS,
				series: POINTS,
				instances: [
					{ instanceId: 'i1', name: 'orders-1', share: 0.3333, totals: TOTALS },
					{ instanceId: 'i2', name: 'orders-2', share: 0.3333, totals: TOTALS },
					{ instanceId: 'gone', name: 'orders-9', share: 0.3334, totals: TOTALS },
				],
				statusBreakdown: {},
			}),
			consumer: vi.fn().mockResolvedValue({ window: WINDOW, totals: TOTALS, series: [], routes: [] }),
		},
		routes: { list: vi.fn().mockResolvedValue([ROUTE]) },
		services: {
			get: vi.fn().mockResolvedValue({
				instances: [
					{ id: 'i1', isEnabled: true, live: { health: 'healthy', circuit: 'closed' }, chaos: null },
					{ id: 'i2', isEnabled: true, live: null, chaos: { latencyMs: 1200, jitterMs: 0, errorRate: 0, isDown: false } },
				],
			}),
		},
		consumers: {
			get: vi.fn().mockResolvedValue({
				slug: 'web',
				name: 'Web',
				rateLimitPerMinute: 600,
				allowedRoutes: [],
				apiKeys: [
					{ id: 'k1', keyPrefix: 'pyle_live_ab', label: null, lastUsedAt: null, revokedAt: null, keyHash: 'secret-hash' },
					{ id: 'k2', keyPrefix: 'pyle_live_cd', label: null, lastUsedAt: null, revokedAt: 'x' },
				],
			}),
		},
	} as unknown as TrafficToolDependencies;

	return { tools: buildTrafficTools(dependencies), dependencies };
}

async function run(name: string, input: Readonly<Record<string, unknown>> = {}): Promise<Record<string, unknown>> {
	const tool = build().tools.find((candidate) => candidate.name === name);

	return JSON.parse((await tool?.run(input)) ?? '{}') as Record<string, unknown>;
}

describe('traffic tools', () => {
	it('summarizes the gateway: routes with traffic by rate and by errors, a compact series', async () => {
		const overview = await run('get_traffic_overview', { window: '6h' });

		expect((overview.topRoutesByRps as { name: string }[]).map((route) => route.name)).toEqual(['Pedidos', 'Usuários']);
		expect((overview.topRoutesByErrors as { name: string }[])[0].name).toBe('Usuários');
		expect((overview.series as { rows: unknown[] }).rows.length).toBeLessThanOrEqual(30);
		expect(overview.totals).toMatchObject({ errPct: 2 });
	});

	it('refuses an unknown window', async () => {
		const tool = build().tools[0];

		await expect(tool.run({ window: '2d' })).rejects.toThrow('window must be one of');
	});

	it('reads a route by id or by prefix, with instance shares in percent', async () => {
		const byPrefix = await run('get_route_stats', { pathPrefix: '/api/orders' });

		expect(byPrefix.route).toMatchObject({ id: 'r1', service: 'orders', methods: 'all' });
		const [healthy, slowed, removed] = byPrefix.instances as readonly unknown[];

		expect(healthy).toEqual(expect.objectContaining({ name: 'orders-1', sharePct: 33.33, isEnabled: true, health: 'healthy', circuit: 'closed' }));
		expect(healthy).not.toHaveProperty('chaos');
		expect(slowed).toEqual(expect.objectContaining({ health: 'unknown', chaos: expect.objectContaining({ latencyMs: 1200 }) }));
		expect(removed).not.toHaveProperty('health');
	});

	it('explains a route it cannot find, or a call without one', async () => {
		const tool = build().tools[1];

		await expect(tool.run({ pathPrefix: '/nope' })).rejects.toThrow('known prefixes: /api/orders');
		await expect(tool.run({})).rejects.toThrow('routeId or pathPrefix is required');
	});

	it('reads a consumer without any secret, only active key prefixes', async () => {
		const text = await build().tools[2].run({ consumerSlug: 'web' });

		expect(text).not.toContain('secret-hash');
		expect(JSON.parse(text).consumer.activeKeys).toEqual([{ id: 'k1', prefix: 'pyle_live_ab', label: null, lastUsedAt: null }]);
		await expect(build().tools[2].run({})).rejects.toThrow('consumerSlug is required');
	});

	it('lets a missing consumer surface as the error it is', async () => {
		const { tools, dependencies } = build();

		vi.mocked(dependencies.consumers.get).mockRejectedValue(new ConfigNotFoundError('Consumer "x" not found'));

		await expect(tools[2].run({ consumerSlug: 'x' })).rejects.toThrow('not found');
	});
});
