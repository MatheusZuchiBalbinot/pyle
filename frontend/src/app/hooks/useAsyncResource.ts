import {
	keepPreviousData,
	useQuery,
	useQueryClient,
	type Query,
	type QueryKey,
	type UseQueryOptions,
	type UseQueryResult,
} from '@tanstack/react-query';
import { useCallback, useEffect, useRef } from 'react';

import { AdminApiError } from '@/app/api/adminApiClient';
import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import { useOptionalRealtimeSubscribe } from '@/app/core/realtime/useRealtime';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

export type AsyncResourceState<T> =
	| { readonly status: typeof LOAD_STATUS.loading }
	| { readonly status: typeof LOAD_STATUS.error; readonly message: string }
	| { readonly status: typeof LOAD_STATUS.loaded; readonly data: T };

export type UseAsyncResourceOptions<T> = {
	// The cache entry (see core/query/queryKeys): it names the data and every input `load` uses.
	readonly queryKey: QueryKey;
	readonly fallbackErrorMessage: string;
	readonly pollIntervalMs?: number;
	// With pollIntervalMs set, polling only runs while this returns true for
	// the latest loaded data (e.g. "an instance is still starting").
	// Omit it to poll unconditionally.
	readonly shouldPoll?: (data: T) => boolean;
	// False keeps the resource in `loading` without ever calling `load` —
	// for a resource whose inputs come from another resource that isn't
	// ready yet.
	readonly isEnabled?: boolean;
	// Realtime events that invalidate this resource.
	readonly refetchOn?: (event: RealtimeEvent) => boolean;
};

export type UseAsyncResourceResult<T> = {
	readonly loadState: AsyncResourceState<T>;
	readonly refetch: () => Promise<void>;
};

export type RealtimeRefetchInput = {
	readonly isEnabled: boolean;
	// The cached data the refetch replaces: skipped while a mutation keyed on it is pending.
	readonly queryKey: QueryKey;
	readonly refetchOn: ((event: RealtimeEvent) => boolean) | undefined;
	readonly refetch: () => Promise<void>;
};

// A TanStack query behind the console's own loading union. When the key changes, the
// previous data stays on screen until the new one arrives (no skeleton flash).
export function useAsyncResource<T>(load: () => Promise<T>, options: UseAsyncResourceOptions<T>): UseAsyncResourceResult<T> {
	const { queryKey, fallbackErrorMessage, pollIntervalMs, shouldPoll, isEnabled = true, refetchOn } = options;

	function resolveRefetchInterval(query: Query<T, Error, T, QueryKey>): number | false {
		if (pollIntervalMs === undefined) {
			return false;
		}

		if (shouldPoll === undefined) {
			return pollIntervalMs;
		}

		const data = query.state.data;
		const isStillNeeded = data !== undefined && shouldPoll(data);

		return isStillNeeded ? pollIntervalMs : false;
	}

	const queryOptions: UseQueryOptions<T, Error, T, QueryKey> = {
		queryKey,
		queryFn: () => load(),
		enabled: isEnabled,
		placeholderData: keepPreviousData,
		refetchInterval: resolveRefetchInterval,
	};
	const query = useQuery(queryOptions);
	const refetch = useRefetch(query);

	useRealtimeRefetch({ isEnabled, queryKey, refetchOn, refetch });

	return { loadState: toLoadState(query, fallbackErrorMessage), refetch };
}

export function toErrorMessage(error: unknown, fallback: string): string {
	return error instanceof AdminApiError ? error.message : fallback;
}

// Subscribes while enabled; the latest predicate is read on each event, so a new
// function identity from the caller does not resubscribe.
export function useRealtimeRefetch({ isEnabled, queryKey, refetchOn, refetch }: RealtimeRefetchInput): void {
	const queryClient = useQueryClient();
	const refetchOnRef = useRef(refetchOn);

	useEffect(() => {
		refetchOnRef.current = refetchOn;
	}, [refetchOn]);

	const handleRealtimeEvent = useCallback(
		(event: RealtimeEvent) => {
			const isRelevant = refetchOnRef.current?.(event) ?? false;
			// The server may answer with what it had before the pending edit; the mutation
			// refetches on its own once it settles.
			const isBeingEdited = queryClient.isMutating({ mutationKey: queryKey }) > 0;

			if (isRelevant && !isBeingEdited) {
				void refetch();
			}
		},
		[queryClient, queryKey, refetch],
	);
	const isListeningForEvents = isEnabled && refetchOn !== undefined;

	useOptionalRealtimeSubscribe(isListeningForEvents ? handleRealtimeEvent : null);
}

function useRefetch<T>(query: UseQueryResult<T>): () => Promise<void> {
	const { refetch } = query;

	return useCallback(async () => {
		await refetch();
	}, [refetch]);
}

function toLoadState<T>(query: UseQueryResult<T>, fallbackErrorMessage: string): AsyncResourceState<T> {
	if (query.status === 'error') {
		return { status: LOAD_STATUS.error, message: toErrorMessage(query.error, fallbackErrorMessage) };
	}

	if (query.data === undefined) {
		return { status: LOAD_STATUS.loading };
	}

	return { status: LOAD_STATUS.loaded, data: query.data };
}
