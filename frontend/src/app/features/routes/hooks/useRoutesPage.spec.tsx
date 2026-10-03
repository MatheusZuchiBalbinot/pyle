import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, deleteRoute, getTrafficOverview, listConsumers, listRoutes, listServices } from '@/app/api/adminApiClient';
import type { TrafficOverview } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildRoute, buildTrafficTotals } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { mergeRouteTraffic, useRoutesPage } from './useRoutesPage';

vi.mock('../../../api/adminApiClient', () => ({
	listRoutes: vi.fn(),
	listServices: vi.fn(),
	listConsumers: vi.fn(),
	getTrafficOverview: vi.fn(),
	deleteRoute: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const ORDERS = buildRoute('/api/orders', { id: 'r-orders' });
const USERS = buildRoute('/api/users', { id: 'r-users' });
const TRAFFIC = {
	routes: [{ routeId: 'r-orders', name: 'Pedidos', pathPrefix: '/api/orders', totals: buildTrafficTotals({ requestCount: 42 }), series: [] }],
} as unknown as TrafficOverview;

function render(selection: ConsoleSelection | null = null) {
	const gateway = buildGatewayHarness({ selection });
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	return { ...renderHook(() => useRoutesPage(), { wrapper }), gateway, realtime };
}

describe('mergeRouteTraffic', () => {
	it('matches traffic to routes by id, none for routes without it', () => {
		const rows = mergeRouteTraffic([ORDERS, USERS], TRAFFIC);

		expect(rows.map((row) => row.totals?.requestCount ?? null)).toEqual([42, null]);
		expect(mergeRouteTraffic([ORDERS], null)[0].totals).toBeNull();
	});
});

describe('useRoutesPage', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('lists routes with their traffic and refetches when a route changes', async () => {
		vi.mocked(listRoutes).mockResolvedValue([ORDERS, USERS]);
		vi.mocked(getTrafficOverview).mockResolvedValue(TRAFFIC);
		const { result, realtime } = render();

		await waitFor(() =>
			expect(result.current.rows).toMatchObject({ status: LOAD_STATUS.loaded, data: [{ totals: { requestCount: 42 } }, { totals: null }] }),
		);

		act(() => realtime.emit(stampLocalEvent({ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r-users' })));

		await waitFor(() => expect(listRoutes).toHaveBeenCalledTimes(2));
		expect(getTrafficOverview).toHaveBeenCalledWith({ window: '15m' });
	});

	it('opens the route the URL selects, and a click opens or closes one through the selection', async () => {
		vi.mocked(listRoutes).mockResolvedValue([ORDERS]);
		vi.mocked(getTrafficOverview).mockResolvedValue(TRAFFIC);
		const { result, gateway } = render({ type: 'route', routeId: 'r-orders' });

		expect(result.current.expandedRouteId).toBe('r-orders');
		act(() => result.current.toggleRoute('r-users'));
		expect(result.current.expandedRouteId).toBe('r-users');
		expect(gateway.selections()).toEqual([{ type: 'route', routeId: 'r-users' }]);
		act(() => result.current.toggleRoute('r-users'));
		expect(result.current.expandedRouteId).toBeNull();
		expect(gateway.clearedSelectionCount()).toBe(1);
	});

	it('removes a route after confirmation, and keeps the dialog on failure', async () => {
		vi.mocked(listRoutes).mockResolvedValue([ORDERS]);
		vi.mocked(getTrafficOverview).mockResolvedValue(TRAFFIC);
		vi.mocked(deleteRoute).mockRejectedValueOnce(new AdminApiError('gone', 404)).mockResolvedValueOnce(undefined);
		const { result, realtime } = render();

		act(() => result.current.requestDelete(ORDERS));
		await act(() => result.current.confirmDelete());
		expect(result.current.deletion).toMatchObject({ isDeleting: false, errorMessage: 'gone' });
		await act(() => result.current.confirmDelete());

		expect(result.current.deletion).toBeNull();
		expect(realtime.events()).toContainEqual(expect.objectContaining({ entity: 'Route', action: 'deleted', id: 'r-orders' }));
		act(() => result.current.requestDelete(ORDERS));
		act(() => result.current.cancelDelete());
		expect(result.current.deletion).toBeNull();
		await act(() => result.current.confirmDelete());
		expect(deleteRoute).toHaveBeenCalledTimes(2);
		expect(listServices).not.toHaveBeenCalled();
		expect(listConsumers).not.toHaveBeenCalled();
	});
});
