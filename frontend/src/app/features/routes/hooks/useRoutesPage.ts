import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, deleteRoute, getTrafficOverview } from '@/app/api/adminApiClient';
import type { Route, TrafficOverview, TrafficTotals } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useLiveTraffic } from '@/app/features/traffic/hooks/useLiveTraffic';
import type { AsyncResourceState } from '@/app/hooks/useAsyncResource';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

export type RouteRow = {
	readonly route: Route;
	// Null when the route had no traffic in the last 15 minutes (or the
	// traffic is still loading).
	readonly totals: TrafficTotals | null;
};

export type RouteDeletion = { readonly route: Route; readonly isDeleting: boolean; readonly errorMessage: string | null };

export type RoutesPageState = {
	readonly rows: AsyncResourceState<readonly RouteRow[]>;
	readonly expandedRouteId: string | null;
	readonly toggleRoute: (routeId: string) => void;
	readonly deletion: RouteDeletion | null;
	readonly requestDelete: (route: Route) => void;
	readonly cancelDelete: () => void;
	readonly confirmDelete: () => Promise<void>;
};

const LIST_TRAFFIC_WINDOW = '15m';

export function mergeRouteTraffic(routes: readonly Route[], traffic: TrafficOverview | null): readonly RouteRow[] {
	const totalsByRoute = new Map((traffic?.routes ?? []).map((summary) => [summary.routeId, summary.totals]));

	return routes.map((route) => ({ route, totals: totalsByRoute.get(route.id) ?? null }));
}

// The traffic column of the routes list.
export function routesListTrafficQuery(): PrefetchableQuery {
	return { queryKey: queryKeys.trafficOverview(LIST_TRAFFIC_WINDOW), queryFn: loadListTraffic };
}

export function useRoutesPage(): RoutesPageState {
	const { t } = useTranslation();
	const { selection, openSelection, clearSelection } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const routes = useConfigList('routes').loadState;
	const traffic = useLiveTraffic(loadListTraffic, {
		queryKey: queryKeys.trafficOverview(LIST_TRAFFIC_WINDOW),
		fallbackErrorMessage: t('routes.loadError'),
	}).loadState;
	const [deletion, setDeletion] = useState<RouteDeletion | null>(null);

	// The open route is part of the URL (/routes/:id), so it can be linked to.
	const expandedRouteId = selection?.type === 'route' ? selection.routeId : null;

	const toggleRoute = useCallback(
		(routeId: string) => {
			if (routeId === expandedRouteId) {
				return clearSelection();
			}

			openSelection({ type: 'route', routeId });
		},
		[expandedRouteId, openSelection, clearSelection],
	);

	function rowsState(): AsyncResourceState<readonly RouteRow[]> {
		if (routes.status !== LOAD_STATUS.loaded) {
			return routes;
		}

		const trafficData = traffic.status === LOAD_STATUS.loaded ? traffic.data : null;

		return { status: LOAD_STATUS.loaded, data: mergeRouteTraffic(routes.data, trafficData) };
	}

	async function confirmDelete(): Promise<void> {
		if (deletion === null) {
			return;
		}

		const { route } = deletion;

		setDeletion({ route, isDeleting: true, errorMessage: null });

		try {
			await deleteRoute(route.id);
			emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Route', action: 'deleted', id: route.id }));
			setDeletion(null);
		} catch (error) {
			const errorMessage = error instanceof AdminApiError ? error.message : t('common.unexpectedError');

			setDeletion({ route, isDeleting: false, errorMessage });
		}
	}

	return {
		rows: rowsState(),
		expandedRouteId,
		toggleRoute,
		deletion,
		requestDelete: (route) => setDeletion({ route, isDeleting: false, errorMessage: null }),
		cancelDelete: () => setDeletion(null),
		confirmDelete,
	};
}

function loadListTraffic(): Promise<TrafficOverview> {
	return getTrafficOverview({ window: LIST_TRAFFIC_WINDOW });
}
