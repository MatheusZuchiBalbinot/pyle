import { createRoute, updateRoute } from '@/app/api/adminApiClient';
import type { Route } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useEntityForm, type EntityForm } from '@/app/hooks/useEntityForm';
import { changedFields } from '@/app/lib/formValidation';

import { EMPTY_ROUTE_FORM, routeToFormValues, toRouteInput, validateRouteForm, type RouteFormValues } from '../lib/routeFormValidation';

export type RouteFormMode = { readonly kind: 'create' } | { readonly kind: 'edit'; readonly route: Route };

const PREFIX_CONFLICT = { field: 'pathPrefix', messageKey: 'routes.form.errors.prefixTaken' } as const;

export function useRouteForm(mode: RouteFormMode): EntityForm<RouteFormValues, Route> {
	const emitLocalEvent = useEmitLocalEvent();

	async function save(values: RouteFormValues): Promise<Route> {
		const saved = await persistRoute(mode, values);
		const action = mode.kind === 'create' ? 'created' : 'updated';

		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Route', action, id: saved.id }));

		return saved;
	}

	const initial = mode.kind === 'create' ? EMPTY_ROUTE_FORM : routeToFormValues(mode.route);

	return useEntityForm({ initial, validate: validateRouteForm, save, conflict: PREFIX_CONFLICT });
}

function persistRoute(mode: RouteFormMode, values: RouteFormValues): Promise<Route> {
	const input = toRouteInput(values);

	if (mode.kind === 'create') {
		return createRoute(input);
	}

	const original = toRouteInput(routeToFormValues(mode.route));

	return updateRoute(mode.route.id, changedFields(original, input));
}
