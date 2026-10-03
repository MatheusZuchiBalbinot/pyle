import { useQueryClient } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { buildQueryHarness } from '@/test/queryHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { AdminApiError } from '../api/adminApiClient';
import type { RealtimeEvent } from '../api/realtimeEvents';
import { LOAD_STATUS } from '../lib/loadStatus';
import { useAsyncResource, type UseAsyncResourceOptions } from './useAsyncResource';

const FALLBACK_ERROR_MESSAGE = 'Não foi possível carregar';
const AT = '2026-03-01T10:00:00.000Z';
const GATEWAY_DOWN: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT };
const GATEWAY_UP: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status: 'up', occurredAt: AT };
const POLL_MS = 20;

type Wrapper = ({ children }: { children: ReactNode }) => ReactNode;

function buildOptions<T>(overrides: Partial<UseAsyncResourceOptions<T>> = {}): UseAsyncResourceOptions<T> {
	return { queryKey: ['test'], fallbackErrorMessage: FALLBACK_ERROR_MESSAGE, ...overrides };
}

function queryWrapper(): Wrapper {
	return buildQueryHarness().wrapper;
}

function isGatewayDown(event: RealtimeEvent): boolean {
	return event.type === 'gateway.status.changed' && event.status === 'down';
}

describe('useAsyncResource', () => {
	it('starts loading and lands on the data', async () => {
		const load = vi.fn().mockResolvedValue(['acme']);

		const { result } = renderHook(() => useAsyncResource(load, buildOptions()), { wrapper: queryWrapper() });

		expect(result.current.loadState.status).toBe(LOAD_STATUS.loading);
		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: ['acme'] }));
	});

	it('shows the API message when the request fails with one', async () => {
		const load = vi.fn().mockRejectedValue(new AdminApiError('Rota não encontrada', 404));

		const { result } = renderHook(() => useAsyncResource(load, buildOptions()), { wrapper: queryWrapper() });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: 'Rota não encontrada' }));
	});

	it('shows the fallback message for a failure that carries none, never a raw stack', async () => {
		const load = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

		const { result } = renderHook(() => useAsyncResource(load, buildOptions()), { wrapper: queryWrapper() });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: FALLBACK_ERROR_MESSAGE }));
	});

	it('never calls the loader while disabled, stays in loading, and loads once enabled', async () => {
		const load = vi.fn().mockResolvedValue('ready');

		const { result, rerender } = renderHook(({ isEnabled }) => useAsyncResource(load, buildOptions({ isEnabled })), {
			wrapper: queryWrapper(),
			initialProps: { isEnabled: false },
		});

		expect(load).not.toHaveBeenCalled();
		expect(result.current.loadState.status).toBe(LOAD_STATUS.loading);

		rerender({ isEnabled: true });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: 'ready' }));
	});

	it('loads again when the key changes, keeping the previous data on screen meanwhile', async () => {
		let resolveSecond: (value: string) => void = () => undefined;
		const load = vi
			.fn()
			.mockResolvedValueOnce('route a')
			.mockImplementationOnce(() => new Promise<string>((resolve) => (resolveSecond = resolve)));

		const { result, rerender } = renderHook(({ routeId }) => useAsyncResource(load, buildOptions({ queryKey: ['route', routeId] })), {
			wrapper: queryWrapper(),
			initialProps: { routeId: 'a' },
		});

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: 'route a' }));

		rerender({ routeId: 'b' });

		await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: 'route a' });

		await act(async () => resolveSecond('route b'));

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: 'route b' }));
	});

	it('refetch loads once more and the new data reaches the screen', async () => {
		let version = 0;
		const load = vi.fn(async () => {
			version += 1;

			return version;
		});

		const { result } = renderHook(() => useAsyncResource(load, buildOptions()), { wrapper: queryWrapper() });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		const versionBefore = version;

		await act(() => result.current.refetch());

		// TanStack notifies React on the next tick, after the promise resolved.
		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: versionBefore + 1 }));
		expect(load).toHaveBeenCalledTimes(versionBefore + 1);
	});

	describe('polling', () => {
		it('refetches on the interval, and stops once the data says there is nothing left to watch', async () => {
			const load = vi.fn().mockResolvedValueOnce('starting').mockResolvedValueOnce('starting').mockResolvedValue('running');
			const shouldPoll = (status: string): boolean => status === 'starting';

			const { result } = renderHook(() => useAsyncResource(load, buildOptions({ pollIntervalMs: POLL_MS, shouldPoll })), { wrapper: queryWrapper() });

			await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: 'running' }));
			const callsWhenSettled = load.mock.calls.length;

			await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));

			expect(load).toHaveBeenCalledTimes(callsWhenSettled);
		});

		it('does not poll at all without an interval', async () => {
			const load = vi.fn().mockResolvedValue('x');

			renderHook(() => useAsyncResource(load, buildOptions()), { wrapper: queryWrapper() });

			await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
			await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));

			expect(load).toHaveBeenCalledTimes(1);
		});

		it('stops polling on unmount', async () => {
			const load = vi.fn().mockResolvedValue('x');

			const { unmount } = renderHook(() => useAsyncResource(load, buildOptions({ pollIntervalMs: POLL_MS })), { wrapper: queryWrapper() });

			await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(2));
			unmount();
			const callsAtUnmount = load.mock.calls.length;

			await new Promise((resolve) => setTimeout(resolve, POLL_MS * 4));

			expect(load).toHaveBeenCalledTimes(callsAtUnmount);
		});
	});

	describe('realtime invalidation', () => {
		it('refetches on a matching event and ignores the rest', async () => {
			const realtime = buildRealtimeHarness();
			const load = vi.fn().mockResolvedValue('x');

			renderHook(() => useAsyncResource(load, buildOptions({ refetchOn: isGatewayDown })), { wrapper: realtime.wrapper });

			await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
			act(() => realtime.emit(GATEWAY_UP));
			act(() => realtime.emit(GATEWAY_DOWN));

			await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		});

		it('holds a realtime refetch while an edit of the same data is pending, so it cannot undo the edit', async () => {
			const realtime = buildRealtimeHarness();
			const load = vi.fn().mockResolvedValue('x');
			const { result } = renderHook(
				() => ({ resource: useAsyncResource(load, buildOptions({ refetchOn: isGatewayDown })), client: useQueryClient() }),
				{
					wrapper: realtime.wrapper,
				},
			);
			let finishEdit: () => void = () => undefined;
			const edit = new Promise<void>((resolve) => {
				finishEdit = resolve;
			});

			await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
			const pendingEdit = result.current.client
				.getMutationCache()
				.build(result.current.client, { mutationKey: ['test'], mutationFn: () => edit })
				.execute(undefined);

			act(() => realtime.emit(GATEWAY_DOWN));
			expect(load).toHaveBeenCalledTimes(1);

			finishEdit();
			await pendingEdit;
			act(() => realtime.emit(GATEWAY_DOWN));
			await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		});

		it('does not subscribe while disabled', () => {
			const realtime = buildRealtimeHarness();
			const load = vi.fn().mockResolvedValue('x');

			renderHook(() => useAsyncResource(load, buildOptions({ refetchOn: isGatewayDown, isEnabled: false })), { wrapper: realtime.wrapper });

			expect(realtime.subscriberCount()).toBe(0);
		});

		it('works with no realtime provider at all, instead of throwing', async () => {
			const load = vi.fn().mockResolvedValue('x');

			const { result } = renderHook(() => useAsyncResource(load, buildOptions({ refetchOn: isGatewayDown })), { wrapper: queryWrapper() });

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		});
	});
});
