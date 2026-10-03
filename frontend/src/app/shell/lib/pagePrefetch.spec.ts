import { QueryClient } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getServiceTraffic, getTrafficOverview, listRoutes } from '@/app/api/adminApiClient';
import { queryKeys } from '@/app/core/query/queryKeys';

import { prefetchPage } from './pagePrefetch';

vi.mock('../../api/adminApiClient', () => ({
	getAdminOverview: vi.fn().mockResolvedValue({ status: 'ok' }),
	getTrafficOverview: vi.fn().mockResolvedValue({ routes: [] }),
	getRouteTraffic: vi.fn(),
	getServiceTraffic: vi.fn(async (slug: string) => ({ service: { slug } })),
	getPlatformSettings: vi.fn().mockResolvedValue({ traffic: { isChaosAllowed: false }, scaling: { isAllowed: false } }),
	getAlertRules: vi.fn().mockResolvedValue([]),
	getSystemHealth: vi.fn().mockResolvedValue([]),
	listRoutes: vi.fn().mockResolvedValue([]),
	listServices: vi.fn().mockResolvedValue([{ slug: 'orders' }, { slug: 'users' }]),
	listConsumers: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
	AdminApiError: class AdminApiError extends Error {},
}));

const STALE_TIME_MS = 5000;

function buildClient(): QueryClient {
	return new QueryClient({ defaultOptions: { queries: { staleTime: STALE_TIME_MS, retry: false } } });
}

function cachedKeys(client: QueryClient): readonly unknown[] {
	return client
		.getQueryCache()
		.getAll()
		.map((query) => query.queryKey);
}

describe('prefetchPage', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('fills the cache under the keys the page reads, and does not refetch fresh data', async () => {
		const client = buildClient();

		prefetchPage(client, 'routes');
		await vi.waitFor(() => expect(client.getQueryData(queryKeys.configList('routes'))).toEqual([]));
		expect(client.getQueryData(queryKeys.trafficOverview('15m'))).toEqual({ routes: [] });

		prefetchPage(client, 'routes');
		expect(listRoutes).toHaveBeenCalledTimes(1);
	});

	it('fetches the services first, then the traffic of exactly those services', async () => {
		const client = buildClient();

		prefetchPage(client, 'services');

		await vi.waitFor(() => expect(client.getQueryData(queryKeys.servicesTraffic('orders,users'))).toBeDefined());
		expect(getServiceTraffic).toHaveBeenCalledTimes(2);
		expect(client.getQueryData(queryKeys.servicesCapabilities())).toEqual({ isChaosAllowed: false, maxManagedReplicas: null });
	});

	it('opens Traffic in the default window and Settings with its three reads', async () => {
		const client = buildClient();

		prefetchPage(client, 'traffic');
		prefetchPage(client, 'settings');

		await vi.waitFor(() => expect(cachedKeys(client)).toHaveLength(4));
		expect(getTrafficOverview).toHaveBeenCalledWith({ window: '1h' });
		expect(cachedKeys(client)).toEqual(
			expect.arrayContaining([queryKeys.trafficPage('1h', null), queryKeys.platformSettings(), queryKeys.alertRules(), queryKeys.systemHealth()]),
		);
	});

	it('leaves alone the pages whose first query depends on what the user does there', () => {
		const client = buildClient();

		prefetchPage(client, 'consumers');
		prefetchPage(client, 'assistant');
		prefetchPage(client, 'ai');

		expect(cachedKeys(client)).toEqual([]);
	});
});
