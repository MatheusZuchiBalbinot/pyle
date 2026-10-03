import { useInfiniteQuery, useQueryClient, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { Page, PageQuery } from '@/app/api/adminApiTypes';
import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { toErrorMessage, useRealtimeRefetch, type RealtimeRefetchInput } from './useAsyncResource';

export type PaginatedState<T> =
	| { readonly status: typeof LOAD_STATUS.loading }
	| { readonly status: typeof LOAD_STATUS.error; readonly message: string }
	| { readonly status: typeof LOAD_STATUS.loaded; readonly items: readonly T[]; readonly hasMore: boolean };

export type UsePaginatedResourceOptions = {
	// The cache entry (see core/query/queryKeys): it names the list and every filter `load` uses.
	readonly queryKey: QueryKey;
	readonly fallbackErrorMessage: string;
	// An invalidation reloads the first page and drops the tail: a new row at the top
	// shifts every cursor.
	readonly refetchOn?: (event: RealtimeEvent) => boolean;
	readonly isEnabled?: boolean;
	readonly pageSize?: number;
};

export type UsePaginatedResourceResult<T> = {
	readonly loadState: PaginatedState<T>;
	readonly isLoadingMore: boolean;
	readonly loadMore: () => void;
	readonly reload: () => Promise<void>;
};

type Cursor = string | null;
type Pages<T> = InfiniteData<Page<T>, Cursor>;

// Cursor pages over a TanStack infinite query, behind the console's own loading union.
export function usePaginatedResource<T>(
	load: (page: PageQuery) => Promise<Page<T>>,
	options: UsePaginatedResourceOptions,
): UsePaginatedResourceResult<T> {
	const { queryKey, fallbackErrorMessage, refetchOn, isEnabled = true, pageSize } = options;
	const queryClient = useQueryClient();

	function loadPage({ pageParam }: { readonly pageParam: Cursor }): Promise<Page<T>> {
		const pageQuery: PageQuery = pageParam === null ? { limit: pageSize } : { cursor: pageParam, limit: pageSize };

		return load(pageQuery);
	}

	// null: the first page.
	const query = useInfiniteQuery<Page<T>, Error, Pages<T>, QueryKey, Cursor>({
		queryKey,
		queryFn: loadPage,
		initialPageParam: null,
		getNextPageParam: (lastPage: Page<T>) => lastPage.nextCursor ?? undefined,
		enabled: isEnabled,
	});
	const { hasNextPage, isFetchingNextPage, fetchNextPage, refetch } = query;

	const loadMore = useCallback((): void => {
		const canLoadMore = hasNextPage && !isFetchingNextPage;

		if (!canLoadMore) {
			return;
		}

		void fetchNextPage();
	}, [hasNextPage, isFetchingNextPage, fetchNextPage]);

	// Back to the first page only, then refetch it: a refetch of every loaded page would
	// walk cursors that the new rows have shifted.
	const reload = useCallback(async (): Promise<void> => {
		queryClient.setQueryData<Pages<T>>(queryKey, keepFirstPage);
		await refetch();
	}, [queryClient, queryKey, refetch]);

	const realtimeInput: RealtimeRefetchInput = { isEnabled, queryKey, refetchOn, refetch: reload };

	useRealtimeRefetch(realtimeInput);

	return { loadState: toLoadState(query, fallbackErrorMessage), isLoadingMore: isFetchingNextPage, loadMore, reload };
}

function keepFirstPage<T>(data: Pages<T> | undefined): Pages<T> | undefined {
	if (data === undefined) {
		return data;
	}

	return { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
}

function toLoadState<T>(query: UseInfiniteQueryResult<Pages<T>>, fallbackErrorMessage: string): PaginatedState<T> {
	if (query.status === 'error') {
		return { status: LOAD_STATUS.error, message: toErrorMessage(query.error, fallbackErrorMessage) };
	}

	if (query.data === undefined) {
		return { status: LOAD_STATUS.loading };
	}

	const items = query.data.pages.flatMap((page) => page.items);

	return { status: LOAD_STATUS.loaded, items, hasMore: query.hasNextPage };
}
