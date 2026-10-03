import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildQueryHarness } from '@/test/queryHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { AdminApiError } from '../api/adminApiClient';
import type { Page, PageQuery } from '../api/adminApiTypes';
import type { RealtimeEvent } from '../api/realtimeEvents';
import { LOAD_STATUS } from '../lib/loadStatus';
import { usePaginatedResource, type UsePaginatedResourceOptions } from './usePaginatedResource';

const FALLBACK_ERROR_MESSAGE = 'Não foi possível carregar';
const AT = '2026-03-01T10:00:00.000Z';
const GATEWAY_DOWN: RealtimeEvent = { type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT };

function buildOptions(overrides: Partial<UsePaginatedResourceOptions> = {}): UsePaginatedResourceOptions {
	return { queryKey: ['test'], fallbackErrorMessage: FALLBACK_ERROR_MESSAGE, ...overrides };
}

// Serves a fixed list one page at a time through real cursors, so the
// walk under test is the same one the API would drive.
function buildPagedLoader(items: readonly string[], pageSize: number): (page: PageQuery) => Promise<Page<string>> {
	return (page: PageQuery) => {
		const start = page.cursor ? Number(page.cursor) : 0;
		const slice = items.slice(start, start + pageSize);
		const nextStart = start + slice.length;

		return Promise.resolve({ items: slice, nextCursor: nextStart < items.length ? String(nextStart) : null });
	};
}

describe('usePaginatedResource', () => {
	it('loads the first page and says whether there is more', async () => {
		const load = vi.fn(buildPagedLoader(['a', 'b', 'c'], 2));

		const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ pageSize: 2 })), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, items: ['a', 'b'], hasMore: true }));
		expect(load).toHaveBeenCalledWith({ limit: 2 });
	});

	it('reports the last page as having nothing more', async () => {
		const load = vi.fn(buildPagedLoader(['a'], 2));

		const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ pageSize: 2 })), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, items: ['a'], hasMore: false }));
	});

	it('appends the next page instead of replacing what is on screen', async () => {
		const load = vi.fn(buildPagedLoader(['a', 'b', 'c', 'd'], 2));
		const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ pageSize: 2 })), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		act(() => result.current.loadMore());

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, items: ['a', 'b', 'c', 'd'], hasMore: false }));
		expect(load).toHaveBeenLastCalledWith({ cursor: '2', limit: 2 });
	});

	it('does nothing on loadMore when the walk already reached the end', async () => {
		const load = vi.fn(buildPagedLoader(['a'], 2));
		const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ pageSize: 2 })), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		act(() => result.current.loadMore());

		expect(load).toHaveBeenCalledTimes(1);
	});

	it('exposes that a page is on its way, so the list can show it', async () => {
		let resolvePage: ((page: Page<string>) => void) | undefined;
		const load = vi
			.fn()
			.mockResolvedValueOnce({ items: ['a'], nextCursor: '1' })
			.mockImplementationOnce(
				() =>
					new Promise<Page<string>>((resolve) => {
						resolvePage = resolve;
					}),
			);
		const { result } = renderHook(() => usePaginatedResource(load, buildOptions()), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		act(() => result.current.loadMore());
		await waitFor(() => expect(result.current.isLoadingMore).toBe(true));
		await act(async () => {
			resolvePage?.({ items: ['b'], nextCursor: null });
		});

		await waitFor(() => expect(result.current.isLoadingMore).toBe(false));
	});

	describe('failures', () => {
		it('shows the API message for a failed first page', async () => {
			const load = vi.fn().mockRejectedValue(new AdminApiError('Cursor malformado', 400));

			const { result } = renderHook(() => usePaginatedResource(load, buildOptions()), { wrapper: buildQueryHarness().wrapper });

			await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: 'Cursor malformado' }));
		});

		it('falls back to its own message for a failure that carries none', async () => {
			const load = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

			const { result } = renderHook(() => usePaginatedResource(load, buildOptions()), { wrapper: buildQueryHarness().wrapper });

			await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: FALLBACK_ERROR_MESSAGE }));
		});

		it('surfaces a failed next page rather than leaving a spinner on forever', async () => {
			const load = vi
				.fn()
				.mockResolvedValueOnce({ items: ['a'], nextCursor: '1' })
				.mockRejectedValueOnce(new AdminApiError('Falhou', 500));
			const { result } = renderHook(() => usePaginatedResource(load, buildOptions()), { wrapper: buildQueryHarness().wrapper });

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			act(() => result.current.loadMore());

			await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: 'Falhou' }));
			expect(result.current.isLoadingMore).toBe(false);
		});
	});

	describe('reload', () => {
		// A row inserted at the top shifts every cursor the accumulated
		// pages were fetched with, so keeping the tail would duplicate rows.
		it('drops the accumulated tail and starts the walk over', async () => {
			const load = vi.fn(buildPagedLoader(['a', 'b', 'c', 'd'], 2));
			const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ pageSize: 2 })), { wrapper: buildQueryHarness().wrapper });

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
			act(() => result.current.loadMore());
			await waitFor(() => expect(result.current.loadState).toEqual(expect.objectContaining({ items: ['a', 'b', 'c', 'd'] })));

			await act(async () => {
				await result.current.reload();
			});

			await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, items: ['a', 'b'], hasMore: true }));
			expect(load).toHaveBeenLastCalledWith({ limit: 2 });
		});

		it('reloads on an event the list declared it cares about', async () => {
			const harness = buildRealtimeHarness();
			const load = vi.fn(buildPagedLoader(['a'], 2));
			const refetchOn = (event: RealtimeEvent): boolean => event.type === 'gateway.status.changed' && event.status === 'down';
			const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ refetchOn })), { wrapper: harness.wrapper });

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				harness.emit(GATEWAY_DOWN);
			});

			await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
		});

		it('ignores an event it did not ask for', async () => {
			const harness = buildRealtimeHarness();
			const load = vi.fn(buildPagedLoader(['a'], 2));
			const refetchOn = (event: RealtimeEvent): boolean => event.type === 'chaos.changed';
			const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ refetchOn })), { wrapper: harness.wrapper });

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				harness.emit(GATEWAY_DOWN);
			});

			expect(load).toHaveBeenCalledTimes(1);
		});

		it('unsubscribes on unmount', async () => {
			const harness = buildRealtimeHarness();
			const load = vi.fn(buildPagedLoader(['a'], 2));
			const { unmount } = renderHook(() => usePaginatedResource(load, buildOptions({ refetchOn: () => true })), { wrapper: harness.wrapper });

			await waitFor(() => expect(harness.subscriberCount()).toBe(1));

			unmount();

			expect(harness.subscriberCount()).toBe(0);
		});
	});

	it('never loads while disabled', async () => {
		const load = vi.fn(buildPagedLoader(['a'], 2));

		const { result } = renderHook(() => usePaginatedResource(load, buildOptions({ isEnabled: false })), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loading));
		expect(load).not.toHaveBeenCalled();
	});

	it('restarts the walk when the filter in the key changes', async () => {
		const loaders: Readonly<Record<string, (page: PageQuery) => Promise<Page<string>>>> = {
			first: vi.fn(buildPagedLoader(['a', 'b'], 1)),
			second: vi.fn(buildPagedLoader(['x'], 1)),
		};
		const { result, rerender } = renderHook(
			({ filter }: { readonly filter: string }) => usePaginatedResource(loaders[filter], buildOptions({ queryKey: ['test', filter], pageSize: 1 })),
			{ wrapper: buildQueryHarness().wrapper, initialProps: { filter: 'first' } },
		);

		await waitFor(() => expect(result.current.loadState).toEqual(expect.objectContaining({ items: ['a'] })));

		rerender({ filter: 'second' });

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, items: ['x'], hasMore: false }));
	});
});
