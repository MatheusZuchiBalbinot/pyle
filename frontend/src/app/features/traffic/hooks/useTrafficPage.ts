import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getRouteTraffic, getTrafficOverview } from '@/app/api/adminApiClient';
import type { RouteTraffic, TrafficOverview, TrafficWindowName } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { useLiveTraffic } from './useLiveTraffic';
import { readStoredTrafficWindow, useTrafficWindow } from './useTrafficWindow';

const TRAFFIC_PAGE_DEFAULT_WINDOW: TrafficWindowName = '1h';

export type TrafficView =
	| { readonly kind: 'all'; readonly window: TrafficWindowName; readonly data: TrafficOverview }
	| { readonly kind: 'route'; readonly window: TrafficWindowName; readonly routeId: string; readonly data: RouteTraffic };

export type TrafficPageState = {
	readonly window: TrafficWindowName;
	readonly setWindow: (value: TrafficWindowName) => void;
	// The route in focus, or null for every route.
	readonly routeId: string | null;
	readonly selectRoute: (routeId: string | null) => void;
	// The data for the current window and route; null until it arrives.
	readonly view: TrafficView | null;
	// A failed refresh keeps the last view on screen and says so here.
	readonly errorMessage: string | null;
};

// All routes, in the window the page will open with.
export function trafficPageQuery(): PrefetchableQuery {
	const window = readStoredTrafficWindow('traffic', TRAFFIC_PAGE_DEFAULT_WINDOW);

	return { queryKey: queryKeys.trafficPage(window, null), queryFn: () => loadTrafficView(window, null) };
}

export function useTrafficPage(): TrafficPageState {
	const { t } = useTranslation();
	const { window, setWindow } = useTrafficWindow('traffic', TRAFFIC_PAGE_DEFAULT_WINDOW);
	const { selection, openSelection, clearSelection } = useGateway();
	const routeId = selection?.type === 'route-traffic' ? selection.routeId : null;

	const load = useCallback(() => loadTrafficView(window, routeId), [window, routeId]);
	const { loadState } = useLiveTraffic(load, { queryKey: queryKeys.trafficPage(window, routeId), fallbackErrorMessage: t('traffic.loadError') });

	// Adjusting state while rendering (React's documented pattern): the
	// last good view survives a failed refresh.
	const [lastView, setLastView] = useState<TrafficView | null>(null);

	if (loadState.status === LOAD_STATUS.loaded && loadState.data !== lastView) {
		setLastView(loadState.data);
	}

	const selectRoute = useCallback(
		(nextRouteId: string | null) => {
			if (nextRouteId === null) {
				return clearSelection();
			}

			openSelection({ type: 'route-traffic', routeId: nextRouteId });
		},
		[openSelection, clearSelection],
	);

	const view = lastView !== null && isViewFor(lastView, window, routeId) ? lastView : null;
	const errorMessage = loadState.status === LOAD_STATUS.error ? loadState.message : null;

	return { window, setWindow, routeId, selectRoute, view, errorMessage };
}

function isViewFor(view: TrafficView, window: TrafficWindowName, routeId: string | null): boolean {
	if (view.window !== window) {
		return false;
	}

	if (view.kind === 'all') {
		return routeId === null;
	}

	return view.routeId === routeId;
}

async function loadTrafficView(window: TrafficWindowName, routeId: string | null): Promise<TrafficView> {
	if (routeId === null) {
		return { kind: 'all', window, data: await getTrafficOverview({ window }) };
	}

	return { kind: 'route', window, routeId, data: await getRouteTraffic(routeId, { window }) };
}
