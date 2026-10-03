import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, getRouteTraffic, getTrafficOverview } from '@/app/api/adminApiClient';
import type { RouteTraffic, TrafficOverview } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useTrafficPage } from './useTrafficPage';

vi.mock('../../../api/adminApiClient', () => ({
	getTrafficOverview: vi.fn(),
	getRouteTraffic: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const OVERVIEW = { routes: [] } as unknown as TrafficOverview;
const ROUTE = { route: { id: 'r1' } } as unknown as RouteTraffic;

function render(selection: ConsoleSelection | null = null) {
	const gateway = buildGatewayHarness({ selection });
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	return { ...renderHook(() => useTrafficPage(), { wrapper }), gateway, realtime };
}

describe('useTrafficPage', () => {
	afterEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	it('shows every route by default and refetches when the window changes', async () => {
		vi.mocked(getTrafficOverview).mockResolvedValue(OVERVIEW);
		const { result } = render();

		await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'all', window: '1h', data: OVERVIEW }));

		act(() => result.current.setWindow('6h'));

		expect(result.current.view).toBeNull();
		await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'all', window: '6h' }));
		expect(getTrafficOverview).toHaveBeenLastCalledWith({ window: '6h' });
	});

	it('shows one route when the console selected it, and switches through the selection', async () => {
		vi.mocked(getRouteTraffic).mockResolvedValue(ROUTE);
		const { result, gateway } = render({ type: 'route-traffic', routeId: 'r1' });

		await waitFor(() => expect(result.current.view).toMatchObject({ kind: 'route', routeId: 'r1', data: ROUTE }));
		act(() => result.current.selectRoute('r2'));
		expect(result.current.routeId).toBe('r2');
		act(() => result.current.selectRoute(null));

		expect(result.current.routeId).toBeNull();
		expect(gateway.selections()).toEqual([{ type: 'route-traffic', routeId: 'r2' }]);
		expect(gateway.clearedSelectionCount()).toBe(1);
	});

	it('keeps the last data when a refresh fails, and says so', async () => {
		vi.mocked(getTrafficOverview).mockResolvedValueOnce(OVERVIEW).mockRejectedValueOnce(new AdminApiError('down', 503));
		const { result, realtime } = render();

		await waitFor(() => expect(result.current.view).not.toBeNull());

		act(() => realtime.emit(stampLocalEvent({ type: 'traffic.collected', bucketStart: '', routeIds: [], bucketMs: 10_000 })));

		await waitFor(() => expect(result.current.errorMessage).toBe('down'));
		expect(result.current.view).toMatchObject({ data: OVERVIEW });
	});
});
