import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, setServiceReplicas } from '@/app/api/adminApiClient';
import type { Service } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';
import { buildService } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildQueryHarness } from '@/test/queryHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useServiceScaling, withDesiredReplicas } from './useServiceScaling';

vi.mock('../../../api/adminApiClient', () => ({
	setServiceReplicas: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const MAX = 3;
const SERVICES_KEY = queryKeys.configList('services');

function scalable(desiredManagedReplicas: number): Service {
	return buildService('orders', { name: 'Pedidos', scaling: { profile: 'demo_orders', desiredManagedReplicas } });
}

// The hook reads its service from the services list, as the page does, so an optimistic
// write or a rollback reaches it through the cache.
function render(initial: Service) {
	const gateway = buildGatewayHarness();
	const query = buildQueryHarness();
	const realtime = buildRealtimeHarness();
	const server = { services: [initial] as readonly Service[] };

	query.client.setQueryData(SERVICES_KEY, [initial]);

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		// Innermost, so this client wins over the ones the other harnesses bring.
		return gateway.wrapper({ children: realtime.wrapper({ children: query.wrapper({ children }) }) });
	}

	function useScalingFromCache() {
		const options: UseQueryOptions<readonly Service[]> = {
			queryKey: SERVICES_KEY,
			queryFn: () => Promise.resolve(server.services),
			staleTime: Infinity,
		};
		const services = useQuery(options).data ?? [initial];

		return useServiceScaling(services[0], MAX);
	}

	const hook = renderHook(useScalingFromCache, { wrapper });

	return { ...hook, gateway, realtime, query, server };
}

function desiredInCache(client: ReturnType<typeof buildQueryHarness>['client']): number | undefined {
	return client.getQueryData<readonly Service[]>(SERVICES_KEY)?.[0].scaling.desiredManagedReplicas;
}

describe('useServiceScaling', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('steps within 0..max, and cancel goes back to the applied number', () => {
		const { result } = render(scalable(1));

		expect(result.current.isDirty).toBe(false);
		act(() => result.current.increase());
		act(() => result.current.increase());
		act(() => result.current.increase());
		expect(result.current.target).toBe(MAX);
		expect(result.current.canIncrease).toBe(false);
		expect(result.current.isDirty).toBe(true);

		act(() => result.current.cancel());
		expect(result.current.target).toBe(1);
		expect(result.current.isDirty).toBe(false);

		act(() => result.current.decrease());
		act(() => result.current.decrease());
		expect(result.current.target).toBe(0);
		expect(result.current.canDecrease).toBe(false);
	});

	it('applies optimistically, then confirms and refetches', async () => {
		let resolveRequest: (service: Service) => void = () => undefined;

		vi.mocked(setServiceReplicas).mockReturnValue(new Promise((resolve) => (resolveRequest = resolve)));
		const { result, gateway, realtime, query, server } = render(scalable(1));

		act(() => result.current.increase());
		act(() => result.current.apply());

		await waitFor(() => expect(desiredInCache(query.client)).toBe(2));
		expect(result.current.applied).toBe(2);
		expect(result.current.isDirty).toBe(false);
		expect(result.current.isSaving).toBe(true);
		expect(setServiceReplicas).toHaveBeenCalledWith('orders', 2);

		server.services = [scalable(2)];
		await act(async () => resolveRequest(scalable(2)));

		await waitFor(() => expect(result.current.isSaving).toBe(false));
		expect(gateway.toasts()).toEqual([{ message: 'services.scaling.applied', tone: 'success' }]);
		expect(realtime.events()).toEqual([expect.objectContaining({ entity: 'Service', action: 'updated' })]);
		expect(desiredInCache(query.client)).toBe(2);
	});

	it('rolls back and shows the API message when the request fails', async () => {
		vi.mocked(setServiceReplicas).mockRejectedValueOnce(new AdminApiError('Scaling is not enabled', 409));
		const { result, gateway, query } = render(scalable(1));

		act(() => result.current.increase());
		act(() => result.current.apply());

		await waitFor(() => expect(gateway.toasts()).toEqual([{ message: 'Scaling is not enabled', tone: 'danger' }]));
		expect(desiredInCache(query.client)).toBe(1);
		expect(result.current.applied).toBe(1);
		expect(result.current.target).toBe(1);
	});

	it('falls back to a generic message for an unexpected failure', async () => {
		vi.mocked(setServiceReplicas).mockRejectedValueOnce(new Error('network'));
		const { result, gateway } = render(scalable(2));

		act(() => result.current.decrease());
		act(() => result.current.apply());

		await waitFor(() => expect(gateway.toasts()).toEqual([{ message: 'common.unexpectedError', tone: 'danger' }]));
		expect(result.current.applied).toBe(2);
	});
});

describe('withDesiredReplicas', () => {
	it('changes only the named service, without touching the input', () => {
		const orders = scalable(1);
		const users = buildService('users', { scaling: { profile: 'demo_users', desiredManagedReplicas: 1 } });
		const services = [orders, users];

		const next = withDesiredReplicas(services, orders.id, 4);

		expect(next[0].scaling.desiredManagedReplicas).toBe(4);
		expect(next[1]).toBe(users);
		expect(orders.scaling.desiredManagedReplicas).toBe(1);
	});
});
