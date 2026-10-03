import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AdminApiError, setConsumerRoutes } from '@/app/api/adminApiClient';
import type { Consumer, ConsumerRouteRef, Route } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';

import { CONSUMER_PAGES_KEY, invalidateConsumers, takeConsumersSnapshot, writeConsumer, type ConsumersSnapshot } from '../lib/consumerCache';

export type ConsumerRoutesUpdate = {
	// False when it failed: the routes went back and a toast says why.
	readonly saveRoutes: (routeIds: readonly string[]) => Promise<boolean>;
};

const ROUTE_LIST_KEY = queryKeys.configList('routes');

// The allowed routes change on save, before the server answers; a failure puts them back.
export function useConsumerRoutesUpdate(consumer: Consumer): ConsumerRoutesUpdate {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const queryClient = useQueryClient();

	async function snapshotAndApply(routeIds: readonly string[]): Promise<ConsumersSnapshot> {
		const snapshot = await takeConsumersSnapshot(queryClient);
		const knownRoutes = queryClient.getQueryData<readonly Route[]>(ROUTE_LIST_KEY) ?? [];
		const allowedRoutes = resolveRouteRefs(routeIds, knownRoutes, consumer.allowedRoutes);
		const updated: Consumer = { ...consumer, allowedRoutes };

		writeConsumer(queryClient, snapshot, updated);

		return snapshot;
	}

	function handleSuccess(): void {
		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Consumer', action: 'updated', id: consumer.id }));
	}

	function handleError(error: Error, _routeIds: readonly string[], snapshot: ConsumersSnapshot | undefined): void {
		if (snapshot !== undefined) {
			writeConsumer(queryClient, snapshot, consumer);
		}

		toast(error instanceof AdminApiError ? error.message : t('common.unexpectedError'), 'danger');
	}

	async function handleSettled(): Promise<void> {
		await invalidateConsumers(queryClient);
	}

	const mutationOptions: UseMutationOptions<Consumer, Error, readonly string[], ConsumersSnapshot> = {
		// Realtime refetches of this list wait for the edit to settle (useRealtimeRefetch).
		mutationKey: CONSUMER_PAGES_KEY,
		mutationFn: (routeIds) => setConsumerRoutes(consumer.slug, routeIds),
		onMutate: snapshotAndApply,
		onSuccess: handleSuccess,
		onError: handleError,
		onSettled: handleSettled,
	};
	const { mutateAsync } = useMutation(mutationOptions);

	async function saveRoutes(routeIds: readonly string[]): Promise<boolean> {
		try {
			await mutateAsync(routeIds);

			return true;
		} catch {
			// handleError already put the routes back and showed the reason.
			return false;
		}
	}

	return { saveRoutes };
}

// A route the routes list has not loaded keeps the reference the consumer already had.
function resolveRouteRefs(
	routeIds: readonly string[],
	knownRoutes: readonly Route[],
	current: readonly ConsumerRouteRef[],
): readonly ConsumerRouteRef[] {
	const refsById = new Map<string, ConsumerRouteRef>();

	for (const ref of current) {
		refsById.set(ref.id, ref);
	}

	for (const route of knownRoutes) {
		refsById.set(route.id, { id: route.id, name: route.name, pathPrefix: route.pathPrefix });
	}

	return routeIds.flatMap((routeId) => {
		const ref = refsById.get(routeId);

		return ref === undefined ? [] : [ref];
	});
}
