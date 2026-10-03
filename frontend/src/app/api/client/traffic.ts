import type {
	ConsumerTraffic,
	Page,
	PageQuery,
	RequestLogEntry,
	RequestLogFilter,
	RouteTraffic,
	ServiceTraffic,
	TrafficOverview,
	TrafficWindowQuery,
} from '../adminApiTypes';
import { appendPageQuery, requestJson, toQuery } from './request';

export function getTrafficOverview(window: TrafficWindowQuery): Promise<TrafficOverview> {
	return requestJson(`/admin/traffic/overview${toTrafficQuery(window)}`);
}

export function getRouteTraffic(routeId: string, window: TrafficWindowQuery): Promise<RouteTraffic> {
	return requestJson(`/admin/traffic/routes/${encodeURIComponent(routeId)}${toTrafficQuery(window)}`);
}

export function getServiceTraffic(serviceSlug: string, window: TrafficWindowQuery): Promise<ServiceTraffic> {
	return requestJson(`/admin/traffic/services/${encodeURIComponent(serviceSlug)}${toTrafficQuery(window)}`);
}

export function getConsumerTraffic(consumerSlug: string, window: TrafficWindowQuery): Promise<ConsumerTraffic> {
	return requestJson(`/admin/traffic/consumers/${encodeURIComponent(consumerSlug)}${toTrafficQuery(window)}`);
}

export function listRequestLog(filter: RequestLogFilter, page: PageQuery = {}): Promise<Page<RequestLogEntry>> {
	const params = new URLSearchParams();

	if (filter.routeId) {
		params.set('routeId', filter.routeId);
	}

	if (filter.consumerId) {
		params.set('consumerId', filter.consumerId);
	}

	if (filter.instanceId) {
		params.set('instanceId', filter.instanceId);
	}

	if (filter.statusClass) {
		params.set('statusClass', filter.statusClass);
	}

	appendPageQuery(params, page);

	return requestJson(`/admin/traffic/requests${toQuery(params)}`);
}

function toTrafficQuery(window: TrafficWindowQuery): string {
	const params = 'window' in window ? new URLSearchParams({ window: window.window }) : new URLSearchParams({ from: window.from, to: window.to });

	return toQuery(params);
}
