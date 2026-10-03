import { describe, expect, it, vi } from 'vitest';

import { loadGatewayConfig, type ConfigSource } from './load-gateway-config.js';

const OLD = new Date('2026-09-25T10:00:00.000Z');
const NEW = new Date('2026-09-25T11:00:00.000Z');

const SERVICE_ROW = {
	id: 's1',
	slug: 'orders',
	lbStrategy: 'round_robin',
	timeoutMs: 1000,
	retryMaxAttempts: 2,
	healthCheckPath: '/health',
	healthCheckIntervalMs: 5000,
	healthCheckTimeoutMs: 2000,
	healthyThreshold: 2,
	unhealthyThreshold: 3,
	circuitFailureThreshold: 5,
	circuitCooldownMs: 15_000,
	updatedAt: OLD,
	instances: [{ id: 'i1', serviceId: 's1', name: 'orders-1', url: 'http://x', weight: 2, isEnabled: false, updatedAt: NEW }],
};
const ROUTE_ROW = {
	id: 'r1',
	name: 'Pedidos',
	pathPrefix: '/api/orders',
	serviceId: 's1',
	stripPrefix: true,
	methods: ['GET'],
	isAuthRequired: true,
	rateLimitPerMinute: 10,
	timeoutMs: null,
	updatedAt: OLD,
};
const CONSUMER_ROW = { id: 'c1', slug: 'web', rateLimitPerMinute: 600, updatedAt: OLD, routeAccess: [{ routeId: 'r1' }] };

describe('loadGatewayConfig', () => {
	it('reads the active configuration in three queries and shapes it for the data plane', async () => {
		const source = {
			service: { findMany: vi.fn().mockResolvedValue([SERVICE_ROW]) },
			route: { findMany: vi.fn().mockResolvedValue([ROUTE_ROW]) },
			consumer: { findMany: vi.fn().mockResolvedValue([CONSUMER_ROW]) },
		} as unknown as ConfigSource;

		const snapshot = await loadGatewayConfig(source, 42);

		expect(snapshot).toEqual({
			version: NEW.getTime(),
			loadedAt: 42,
			services: [
				{
					id: 's1',
					slug: 'orders',
					lbStrategy: 'round_robin',
					timeoutMs: 1000,
					retryMaxAttempts: 2,
					healthCheck: { path: '/health', intervalMs: 5000, timeoutMs: 2000, healthyThreshold: 2, unhealthyThreshold: 3 },
					circuit: { failureThreshold: 5, cooldownMs: 15_000 },
					instances: [{ id: 'i1', serviceId: 's1', name: 'orders-1', url: 'http://x', weight: 2, isEnabled: false }],
				},
			],
			routes: [
				{
					id: 'r1',
					name: 'Pedidos',
					pathPrefix: '/api/orders',
					serviceId: 's1',
					stripPrefix: true,
					methods: ['GET'],
					isAuthRequired: true,
					rateLimitPerMinute: 10,
					timeoutMs: null,
				},
			],
			consumers: [{ id: 'c1', slug: 'web', rateLimitPerMinute: 600, allowedRouteIds: ['r1'] }],
		});
		expect(vi.mocked(source.route.findMany)).toHaveBeenCalledWith({ where: { deletedAt: null, service: { deletedAt: null } } });
	});

	it('versions an empty configuration as 0', async () => {
		const empty = { findMany: vi.fn().mockResolvedValue([]) };
		const source = { service: empty, route: empty, consumer: empty } as unknown as ConfigSource;

		expect((await loadGatewayConfig(source, 1)).version).toBe(0);
	});
});
