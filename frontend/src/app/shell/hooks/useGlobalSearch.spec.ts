import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listConsumers, listRoutes, listServices } from '@/app/api/adminApiClient';
import { buildRoute, buildService } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { SEARCH_DEBOUNCE_MS, useGlobalSearch } from './useGlobalSearch';

vi.mock('../../api/adminApiClient', () => ({
	listServices: vi.fn(),
	listRoutes: vi.fn(),
	listConsumers: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

describe('useGlobalSearch', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('searches the loaded lists once typing pauses', async () => {
		vi.mocked(listServices).mockResolvedValue([buildService('orders', { name: 'Pedidos' })]);
		vi.mocked(listRoutes).mockResolvedValue([buildRoute('/api/orders', { name: 'Pedidos' })]);
		vi.mocked(listConsumers).mockResolvedValue({ items: [], nextCursor: null });
		const { result } = renderHook(() => useGlobalSearch(), { wrapper: buildRealtimeHarness().wrapper });

		await waitFor(() => expect(result.current.isLoading).toBe(false));
		vi.useFakeTimers();

		act(() => result.current.setQuery('ped'));
		expect(result.current.results).toEqual([]);
		act(() => vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS));

		expect(result.current.results.map((item) => item.kind)).toEqual(['route', 'service']);
	});

	it('searches what it has when a list fails', async () => {
		vi.mocked(listServices).mockRejectedValue(new Error('down'));
		vi.mocked(listRoutes).mockResolvedValue([buildRoute('/api/orders', { name: 'Pedidos' })]);
		vi.mocked(listConsumers).mockResolvedValue({ items: [], nextCursor: null });
		const { result } = renderHook(() => useGlobalSearch(), { wrapper: buildRealtimeHarness().wrapper });

		await waitFor(() => expect(result.current.isLoading).toBe(false));

		act(() => result.current.setQuery('orders'));

		await waitFor(() => expect(result.current.results.map((item) => item.kind)).toEqual(['route']));
	});
});
