import type { CreateRouteInput, Route, UpdateRouteInput } from '../adminApiTypes';
import { jsonBody, requestJson, requestNoContent } from './request';

export function listRoutes(): Promise<readonly Route[]> {
	return requestJson('/admin/routes');
}

export function createRoute(input: CreateRouteInput): Promise<Route> {
	return requestJson('/admin/routes', jsonBody('POST', input));
}

export function updateRoute(id: string, input: UpdateRouteInput): Promise<Route> {
	return requestJson(routePath(id), jsonBody('PATCH', input));
}

export function deleteRoute(id: string): Promise<void> {
	return requestNoContent(routePath(id), { method: 'DELETE' });
}

function routePath(id: string): string {
	return `/admin/routes/${encodeURIComponent(id)}`;
}
