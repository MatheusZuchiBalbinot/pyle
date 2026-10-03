import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildInstance, buildLiveState, buildRoute, buildService } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { listConsumers, listRoutes, listServices } from '../api/adminApiClient';
import { stampLocalEvent } from '../api/realtimeEvents';
import { LOAD_STATUS } from '../lib/loadStatus';
import { hasSettlingInstance, useConfigList } from './useConfigList';

vi.mock('../api/adminApiClient', () => ({
	listServices: vi.fn(),
	listRoutes: vi.fn(),
	listConsumers: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

describe('useConfigList', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('loads services and refetches when an instance changes', async () => {
		vi.mocked(listServices).mockResolvedValue([buildService('orders')]);
		const harness = buildRealtimeHarness();
		const { result } = renderHook(() => useConfigList('services'), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		harness.emit(stampLocalEvent({ type: 'entity.changed', entity: 'ServiceInstance', action: 'updated', id: 'i1' }));
		harness.emit(stampLocalEvent({ type: 'entity.changed', entity: 'Consumer', action: 'updated', id: 'c1' }));

		await waitFor(() => expect(listServices).toHaveBeenCalledTimes(2));
	});

	it('loads routes, and the first page of consumers', async () => {
		vi.mocked(listRoutes).mockResolvedValue([buildRoute('/api/orders')]);
		vi.mocked(listConsumers).mockResolvedValue({ items: [], nextCursor: 'more' });
		const harness = buildRealtimeHarness();

		const routes = renderHook(() => useConfigList('routes'), { wrapper: harness.wrapper });
		const consumers = renderHook(() => useConfigList('consumers'), { wrapper: harness.wrapper });

		await waitFor(() =>
			expect(routes.result.current.loadState).toMatchObject({
				status: LOAD_STATUS.loaded,
				data: [expect.objectContaining({ pathPrefix: '/api/orders' })],
			}),
		);
		await waitFor(() => expect(consumers.result.current.loadState).toMatchObject({ status: LOAD_STATUS.loaded, data: [] }));
	});
});

describe('hasSettlingInstance', () => {
	it('is true while a checked instance has no health reported yet', () => {
		const fresh = buildInstance('orders-m-1', { source: 'managed', scalingState: 'running', live: null });
		const unknown = buildInstance('orders-2', { live: buildLiveState({ instanceId: 'id-orders-2', health: 'unknown' }) });

		expect(hasSettlingInstance([buildService('orders', { instances: [buildInstance('orders-1'), fresh] })])).toBe(true);
		expect(hasSettlingInstance([buildService('orders', { instances: [unknown] })])).toBe(true);
	});

	it('is false once every checked instance has a health, ignoring paused and failed ones', () => {
		const paused = buildInstance('orders-2', { isEnabled: false, live: null });
		const failed = buildInstance('orders-m-1', { source: 'managed', scalingState: 'failed', live: null });

		expect(hasSettlingInstance([buildService('orders', { instances: [buildInstance('orders-1'), paused, failed] })])).toBe(false);
	});
});
