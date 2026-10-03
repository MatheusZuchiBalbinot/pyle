import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPlatformSettings, getServiceTraffic, listServices } from '@/app/api/adminApiClient';
import type { PlatformSettings, ServiceTraffic } from '@/app/api/adminApiTypes';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildService } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useServicesPage } from './useServicesPage';

vi.mock('../../../api/adminApiClient', () => ({
	listServices: vi.fn(),
	listRoutes: vi.fn(),
	listConsumers: vi.fn(),
	getServiceTraffic: vi.fn(),
	getPlatformSettings: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const ORDERS = buildService('orders');
const USERS = buildService('users');

function render(selection: ConsoleSelection | null = null) {
	const gateway = buildGatewayHarness({ selection });
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	return { ...renderHook(() => useServicesPage(), { wrapper }), gateway };
}

describe('useServicesPage', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('pairs each service with its traffic and knows whether chaos is on', async () => {
		vi.mocked(listServices).mockResolvedValue([ORDERS, USERS]);
		vi.mocked(getServiceTraffic).mockImplementation(async (slug) => ({ service: { slug } }) as ServiceTraffic);
		vi.mocked(getPlatformSettings).mockResolvedValue({
			traffic: { isChaosAllowed: true },
			scaling: { isAllowed: true, maxManagedReplicas: 10 },
		} as PlatformSettings);
		const { result } = render();

		await waitFor(() =>
			expect(result.current.cards).toMatchObject({
				status: LOAD_STATUS.loaded,
				data: [{ traffic: { service: { slug: 'orders' } } }, { traffic: { service: { slug: 'users' } } }],
			}),
		);
		await waitFor(() => expect(result.current.isChaosAllowed).toBe(true));
		expect(result.current.maxManagedReplicas).toBe(10);
		expect(getServiceTraffic).toHaveBeenCalledWith('orders', { window: '15m' });
	});

	it('opens an instance under its own service, so the URL names both', async () => {
		vi.mocked(listServices).mockResolvedValue([ORDERS, USERS]);
		vi.mocked(getServiceTraffic).mockImplementation(async (slug) => ({ service: { slug } }) as ServiceTraffic);
		vi.mocked(getPlatformSettings).mockRejectedValue(new Error('down'));
		const { result, gateway } = render();
		const usersInstanceId = USERS.instances[0].id;

		await waitFor(() => expect(result.current.cards.status).toBe(LOAD_STATUS.loaded));
		act(() => result.current.toggleInstance(usersInstanceId));

		expect(result.current.expandedInstanceId).toBe(usersInstanceId);
		expect(gateway.selections()).toEqual([{ type: 'service', serviceSlug: 'users', instanceId: usersInstanceId }]);
	});

	it('shows a failed list, and opens the selected instance', async () => {
		vi.mocked(listServices).mockRejectedValue(new Error('down'));
		vi.mocked(getPlatformSettings).mockRejectedValue(new Error('down'));
		const { result, gateway } = render({ type: 'service', serviceSlug: 'orders', instanceId: 'i1' });

		await waitFor(() => expect(result.current.cards.status).toBe(LOAD_STATUS.error));
		expect(result.current.expandedInstanceId).toBe('i1');
		expect(result.current.isChaosAllowed).toBe(false);
		expect(result.current.maxManagedReplicas).toBeNull();
		act(() => result.current.toggleInstance('i1'));
		expect(result.current.expandedInstanceId).toBeNull();
		expect(gateway.clearedSelectionCount()).toBe(1);
	});
});
