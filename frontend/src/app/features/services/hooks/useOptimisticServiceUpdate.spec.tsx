import { useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, listServices, updateInstance, updateService } from '@/app/api/adminApiClient';
import type { Service, UpdateInstanceResult } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildInstance, buildService } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useOptimisticServiceUpdate, withServiceUpdate, type ServiceUpdate } from './useOptimisticServiceUpdate';

vi.mock('../../../api/adminApiClient', () => ({
	listServices: vi.fn(),
	listRoutes: vi.fn(),
	listConsumers: vi.fn(),
	updateInstance: vi.fn(),
	updateService: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

type Deferred<T> = { readonly promise: Promise<T>; readonly resolve: (value: T) => void; readonly reject: (error: unknown) => void };

const INSTANCE = buildInstance('orders-1', { weight: 1 });
const SERVICE = buildService('orders', { instances: [INSTANCE] });
const OTHER = buildService('users');
const TO_WEIGHTED: ServiceUpdate = { kind: 'strategy', service: SERVICE, strategy: 'weighted_random' };

function deferred<T>(): Deferred<T> {
	let resolve: (value: T) => void = () => undefined;
	let reject: (error: unknown) => void = () => undefined;
	const promise = new Promise<T>((onResolve, onReject) => {
		resolve = onResolve;
		reject = onReject;
	});

	return { promise, resolve, reject };
}

function useServicesWithUpdate() {
	const services = useConfigList('services').loadState;
	const { apply } = useOptimisticServiceUpdate();
	const queryClient = useQueryClient();

	return { services, apply, queryClient };
}

async function renderLoaded() {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	const rendered = renderHook(useServicesWithUpdate, { wrapper });

	await waitFor(() => expect(rendered.result.current.services.status).toBe(LOAD_STATUS.loaded));

	return { ...rendered, gateway, realtime };
}

function servicesOf(state: ReturnType<typeof useServicesWithUpdate>['services']): readonly Service[] {
	return state.status === LOAD_STATUS.loaded ? state.data : [];
}

describe('withServiceUpdate', () => {
	it('changes only the targeted service and instance', () => {
		const update: ServiceUpdate = { kind: 'weight', service: SERVICE, instance: INSTANCE, weight: 7 };
		const [orders, users] = withServiceUpdate([SERVICE, OTHER], update);

		expect(orders.instances[0].weight).toBe(7);
		expect(users).toBe(OTHER);
	});
});

describe('useOptimisticServiceUpdate', () => {
	afterEach(() => {
		vi.resetAllMocks();
	});

	it('shows the new strategy before the request resolves, then refetches on settle', async () => {
		const request = deferred<Service>();

		vi.mocked(listServices)
			.mockResolvedValueOnce([SERVICE, OTHER])
			.mockResolvedValue([{ ...SERVICE, lbStrategy: 'weighted_random' }, OTHER]);
		vi.mocked(updateService).mockReturnValue(request.promise);
		const { result, gateway } = await renderLoaded();
		const invalidate = vi.spyOn(result.current.queryClient, 'invalidateQueries');
		let outcome: Promise<unknown> = Promise.resolve();

		act(() => {
			outcome = result.current.apply(TO_WEIGHTED);
		});

		await waitFor(() => expect(servicesOf(result.current.services)[0].lbStrategy).toBe('weighted_random'));
		expect(updateService).toHaveBeenCalledWith('orders', { lbStrategy: 'weighted_random' });
		expect(invalidate).not.toHaveBeenCalled();

		await act(async () => {
			request.resolve({ ...SERVICE, lbStrategy: 'weighted_random' });
			await outcome;
		});

		expect(await outcome).toEqual({ status: 'applied', warning: null });
		expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.configList('services') });
		expect(servicesOf(result.current.services)[0].lbStrategy).toBe('weighted_random');
		expect(gateway.toasts()).toEqual([]);
	});

	it('rolls the field back and says why when the server refuses', async () => {
		const request = deferred<UpdateInstanceResult>();
		const refetch = deferred<readonly Service[]>();

		// The refetch on settle hangs until the end: only the rollback can bring the old value back.
		vi.mocked(listServices).mockResolvedValueOnce([SERVICE, OTHER]).mockReturnValueOnce(refetch.promise);
		vi.mocked(updateInstance).mockReturnValue(request.promise);
		const { result, gateway } = await renderLoaded();
		const update: ServiceUpdate = { kind: 'enabled', service: SERVICE, instance: INSTANCE, isEnabled: false };
		let outcome: Promise<unknown> = Promise.resolve();

		act(() => {
			outcome = result.current.apply(update);
		});

		await waitFor(() => expect(servicesOf(result.current.services)[0].instances[0].isEnabled).toBe(false));
		act(() => request.reject(new AdminApiError('instância em uso', 409)));

		await waitFor(() => expect(servicesOf(result.current.services)[0].instances[0].isEnabled).toBe(true));
		expect(gateway.toasts()).toEqual([{ message: 'instância em uso', tone: 'danger' }]);

		await act(async () => {
			refetch.resolve([SERVICE, OTHER]);
			await outcome;
		});

		expect(await outcome).toEqual({ status: 'failed' });
	});

	it('passes the server warning along and announces the change locally', async () => {
		vi.mocked(listServices).mockResolvedValue([SERVICE]);
		vi.mocked(updateInstance).mockResolvedValue({ instance: INSTANCE, warning: 'service-has-no-enabled-instance' });
		const { result, realtime } = await renderLoaded();
		const update: ServiceUpdate = { kind: 'weight', service: SERVICE, instance: INSTANCE, weight: 3 };

		const outcome = await act(() => result.current.apply(update));

		expect(updateInstance).toHaveBeenCalledWith('orders', INSTANCE.id, { weight: 3 });
		expect(outcome).toEqual({ status: 'applied', warning: 'service-has-no-enabled-instance' });
		expect(realtime.events()).toContainEqual(expect.objectContaining({ entity: 'ServiceInstance', action: 'updated', id: INSTANCE.id }));
	});

	it('reports an unexpected failure with the generic message', async () => {
		vi.mocked(listServices).mockResolvedValue([SERVICE]);
		vi.mocked(updateService).mockRejectedValue(new Error('network'));
		const { result, gateway } = await renderLoaded();

		const outcome = await act(() => result.current.apply(TO_WEIGHTED));

		expect(outcome).toEqual({ status: 'failed' });
		await waitFor(() => expect(servicesOf(result.current.services)[0].lbStrategy).toBe('round_robin'));
		expect(gateway.toasts()).toEqual([{ message: 'common.unexpectedError', tone: 'danger' }]);
	});
});
