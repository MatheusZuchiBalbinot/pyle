import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { listRequestLog } from '@/app/api/adminApiClient';
import type { RequestLogEntry, RequestLogFilter } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildQueryHarness } from '@/test/queryHarness';

import { useRequestLog } from './useRequestLog';

vi.mock('../../../api/adminApiClient', () => ({ listRequestLog: vi.fn(), AdminApiError: class AdminApiError extends Error {} }));

const ENTRY = { requestId: 'r1' } as RequestLogEntry;

describe('useRequestLog', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('turns the filter into the query, pages with the cursor, and dates the snapshot', async () => {
		vi.mocked(listRequestLog)
			.mockResolvedValueOnce({ items: [ENTRY], nextCursor: '200' })
			.mockResolvedValueOnce({ items: [{ ...ENTRY, requestId: 'r2' }], nextCursor: null });
		const filter: RequestLogFilter = { routeId: 'route-1', statusClass: '5xx' };
		const { result } = renderHook(() => useRequestLog(filter), { wrapper: buildQueryHarness().wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		expect(result.current.snapshotAt).not.toBeNull();

		act(() => result.current.loadMore());

		await waitFor(() => expect(result.current.loadState).toMatchObject({ items: [{ requestId: 'r1' }, { requestId: 'r2' }], hasMore: false }));
		const [first, second] = vi.mocked(listRequestLog).mock.calls;

		expect(first[0]).toEqual({ routeId: 'route-1', consumerId: undefined, instanceId: undefined, statusClass: '5xx' });
		expect(first[1]?.cursor).toBeUndefined();
		expect(second[1]?.cursor).toBe('200');
	});

	it('starts over on refresh and when the filter changes', async () => {
		vi.mocked(listRequestLog).mockResolvedValue({ items: [ENTRY], nextCursor: null });
		const { result, rerender } = renderHook(({ filter }) => useRequestLog(filter), {
			wrapper: buildQueryHarness().wrapper,
			initialProps: { filter: {} as RequestLogFilter },
		});

		await waitFor(() => expect(listRequestLog).toHaveBeenCalledTimes(1));

		await act(() => result.current.reload());
		rerender({ filter: { statusClass: '4xx' } });

		await waitFor(() => expect(listRequestLog).toHaveBeenCalledTimes(3));
		expect(listRequestLog).toHaveBeenLastCalledWith(expect.objectContaining({ statusClass: '4xx' }), expect.anything());
	});
});
