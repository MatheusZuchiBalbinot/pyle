import { useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, setConsumerRoutes } from '@/app/api/adminApiClient';
import type { Consumer, Route } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';
import { buildRoute } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useConsumerRoutesUpdate } from './useConsumerRoutesUpdate';

vi.mock('../../../api/adminApiClient', () => ({
	setConsumerRoutes: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

type Deferred<T> = { readonly promise: Promise<T>; readonly resolve: (value: T) => void; readonly reject: (error: unknown) => void };

const ORDERS_ROUTE: Route = buildRoute('/orders', { id: 'r-orders', name: 'Pedidos' });
const CONSUMER: Consumer = {
	id: 'c1',
	slug: 'web-app',
	name: 'Web app',
	rateLimitPerMinute: 600,
	allowedRoutes: [],
	apiKeys: [],
	createdAt: '',
	updatedAt: '',
};
const CONSUMER_PAGES = { pages: [{ items: [CONSUMER], nextCursor: null }], pageParams: [null] };

function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});

	return { promise, resolve, reject };
}

function useRoutesUpdateWithClient() {
	const { saveRoutes } = useConsumerRoutesUpdate(CONSUMER);
	const queryClient = useQueryClient();

	return { saveRoutes, queryClient };
}

function render() {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	const rendered = renderHook(useRoutesUpdateWithClient, { wrapper });
	const { queryClient } = rendered.result.current;

	// No observer keeps these alive in the test client (gcTime 0): only the writes matter here.
	queryClient.setQueryDefaults(queryKeys.consumers(), { gcTime: Infinity });
	queryClient.setQueryDefaults(queryKeys.configList('consumers'), { gcTime: Infinity });
	queryClient.setQueryData(queryKeys.consumers(), CONSUMER_PAGES);
	queryClient.setQueryData(queryKeys.configList('consumers'), [CONSUMER]);
	queryClient.setQueryData(queryKeys.configList('routes'), [ORDERS_ROUTE]);

	return { ...rendered, gateway, realtime };
}

function allowedRouteIds(queryClient: ReturnType<typeof useQueryClient>): { readonly pages: readonly string[]; readonly list: readonly string[] } {
	const pages = queryClient.getQueryData<typeof CONSUMER_PAGES>(queryKeys.consumers());
	const list = queryClient.getQueryData<readonly Consumer[]>(queryKeys.configList('consumers'));

	return {
		pages: pages?.pages[0].items[0].allowedRoutes.map((route) => route.id) ?? [],
		list: list?.[0].allowedRoutes.map((route) => route.id) ?? [],
	};
}

describe('useConsumerRoutesUpdate', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('shows the new routes in both lists before the server answers', async () => {
		const request = deferred<Consumer>();

		vi.mocked(setConsumerRoutes).mockReturnValue(request.promise);
		const { result, gateway, realtime } = render();
		const { queryClient } = result.current;
		const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
		let saved: Promise<boolean> = Promise.resolve(false);

		act(() => {
			saved = result.current.saveRoutes(['r-orders']);
		});

		await waitFor(() => expect(allowedRouteIds(queryClient)).toEqual({ pages: ['r-orders'], list: ['r-orders'] }));
		expect(invalidate).not.toHaveBeenCalled();

		await act(async () => {
			request.resolve(CONSUMER);
			await saved;
		});

		expect(await saved).toBe(true);
		expect(setConsumerRoutes).toHaveBeenCalledWith('web-app', ['r-orders']);
		expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.consumers() });
		expect(gateway.toasts()).toEqual([]);
		expect(realtime.events()).toContainEqual(expect.objectContaining({ entity: 'Consumer', action: 'updated', id: 'c1' }));
	});

	it('puts the routes back and says why when the server refuses', async () => {
		vi.mocked(setConsumerRoutes).mockRejectedValue(new AdminApiError('rota desconhecida', 422));
		const { result, gateway } = render();

		const saved = await act(() => result.current.saveRoutes(['r-orders']));

		expect(saved).toBe(false);
		expect(allowedRouteIds(result.current.queryClient)).toEqual({ pages: [], list: [] });
		expect(gateway.toasts()).toEqual([{ message: 'rota desconhecida', tone: 'danger' }]);
	});
});
