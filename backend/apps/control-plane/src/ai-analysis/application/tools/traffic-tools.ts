import type { ConsumersService } from '../../../gateway-config/application/consumers.service.js';
import type { RoutesService } from '../../../gateway-config/application/routes.service.js';
import type { ServicesService } from '../../../gateway-config/application/services.service.js';
import type { InstanceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';
import type { TrafficQueryService } from '../../../traffic/application/traffic-query.service.js';
import type { InstanceTrafficDto, RouteTrafficSummaryDto } from '../../../traffic/domain/traffic-responses.js';
import type { AiTool } from '../ai-tool.js';
import { compactTotals, compactTraffic } from './compact-traffic.js';
import { readOptionalString, readRequiredString, readWindow, toJson, toPercent, WINDOW_PROPERTY } from './tool-inputs.js';

const TOP_ROUTES = 10;

export type TrafficToolDependencies = {
	readonly traffic: TrafficQueryService;
	readonly routes: RoutesService;
	readonly consumers: ConsumersService;
	readonly services: ServicesService;
};

export function buildTrafficTools(dependencies: TrafficToolDependencies): readonly AiTool[] {
	return [overviewTool(dependencies), routeStatsTool(dependencies), consumerUsageTool(dependencies)];
}

function summarizeRoute(route: RouteTrafficSummaryDto): Readonly<Record<string, unknown>> {
	return { routeId: route.routeId, name: route.name, pathPrefix: route.pathPrefix, ...compactTotals(route.totals) };
}

function overviewTool(dependencies: TrafficToolDependencies): AiTool {
	return {
		name: 'get_traffic_overview',
		description:
			'Traffic of the whole gateway over a window: totals, a compact series, the top routes by request rate and by 5xx rate, and the top consumers.',
		inputSchema: { type: 'object', properties: { window: WINDOW_PROPERTY }, required: [], additionalProperties: false },
		run: async (input) => {
			const overview = await dependencies.traffic.overview({ kind: 'named', window: readWindow(input) });
			const withTraffic = overview.routes.filter((route) => route.totals.requestCount > 0);
			const byErrors = [...withTraffic].sort((left, right) => right.totals.errorRate - left.totals.errorRate);

			return toJson({
				window: overview.window,
				totals: compactTotals(overview.totals),
				series: compactTraffic(overview.series),
				topRoutesByRps: withTraffic.slice(0, TOP_ROUTES).map(summarizeRoute),
				topRoutesByErrors: byErrors.slice(0, TOP_ROUTES).map(summarizeRoute),
				topConsumers: overview.topConsumers,
			});
		},
	};
}

async function resolveRouteId(dependencies: TrafficToolDependencies, input: Readonly<Record<string, unknown>>): Promise<string> {
	const routeId = readOptionalString(input, 'routeId');

	if (routeId) {
		return routeId;
	}

	const pathPrefix = readOptionalString(input, 'pathPrefix');

	if (!pathPrefix) {
		throw new Error('routeId or pathPrefix is required');
	}

	const routes = await dependencies.routes.list();
	const route = routes.find((candidate) => candidate.pathPrefix === pathPrefix);

	if (!route) {
		throw new Error(`No route with prefix "${pathPrefix}"; known prefixes: ${routes.map((candidate) => candidate.pathPrefix).join(', ')}`);
	}

	return route.id;
}

// An instance's traffic next to what explains it: drained, ejected, circuit
// open or chaos. Chaos is left out when there is none, to keep it short.
function describeRouteInstance(traffic: InstanceTrafficDto, instance: InstanceDto | undefined): Readonly<Record<string, unknown>> {
	const state = instance
		? { isEnabled: instance.isEnabled, health: instance.live?.health ?? 'unknown', circuit: instance.live?.circuit ?? 'unknown' }
		: {};
	const chaos = instance?.chaos ? { chaos: instance.chaos } : {};

	return {
		instanceId: traffic.instanceId,
		name: traffic.name,
		sharePct: toPercent(traffic.share),
		...compactTotals(traffic.totals),
		...state,
		...chaos,
	};
}

function routeStatsTool(dependencies: TrafficToolDependencies): AiTool {
	return {
		name: 'get_route_stats',
		description:
			"One route over a window: its configuration, totals, a compact series, each instance's share of the requests with its p95, 5xx rate, live state and any active chaos, and the status breakdown. Pass routeId or pathPrefix.",
		inputSchema: {
			type: 'object',
			properties: {
				routeId: { type: 'string', description: 'Route id' },
				pathPrefix: { type: 'string', description: 'Or the route prefix, e.g. /api/orders' },
				window: WINDOW_PROPERTY,
			},
			required: [],
			additionalProperties: false,
		},
		run: async (input) => {
			const routeId = await resolveRouteId(dependencies, input);
			const stats = await dependencies.traffic.route(routeId, { kind: 'named', window: readWindow(input) });
			const { route } = stats;
			const service = await dependencies.services.get(route.service.slug);
			const instancesById = new Map(service.instances.map((instance) => [instance.id, instance]));

			return toJson({
				route: {
					id: route.id,
					name: route.name,
					pathPrefix: route.pathPrefix,
					service: route.service.slug,
					stripPrefix: route.stripPrefix,
					methods: route.methods.length === 0 ? 'all' : route.methods,
					isAuthRequired: route.isAuthRequired,
					rateLimitPerMinute: route.rateLimitPerMinute,
					timeoutMs: route.timeoutMs,
				},
				window: stats.window,
				totals: compactTotals(stats.totals),
				series: compactTraffic(stats.series),
				instances: stats.instances.map((instance) => describeRouteInstance(instance, instancesById.get(instance.instanceId))),
				statusBreakdown: stats.statusBreakdown,
			});
		},
	};
}

function consumerUsageTool(dependencies: TrafficToolDependencies): AiTool {
	return {
		name: 'get_consumer_usage',
		description:
			'One consumer over a window: its limit, allowed routes and active keys (prefixes only), totals, 429s, a compact series and the routes it calls most.',
		inputSchema: {
			type: 'object',
			properties: { consumerSlug: { type: 'string' }, window: WINDOW_PROPERTY },
			required: ['consumerSlug'],
			additionalProperties: false,
		},
		run: async (input) => {
			const slug = readRequiredString(input, 'consumerSlug');
			const [consumer, usage] = await Promise.all([
				dependencies.consumers.get(slug),
				dependencies.traffic.consumer(slug, { kind: 'named', window: readWindow(input) }),
			]);
			const activeKeys = consumer.apiKeys
				.filter((key) => key.revokedAt === null)
				.map((key) => ({ id: key.id, prefix: key.keyPrefix, label: key.label, lastUsedAt: key.lastUsedAt }));

			return toJson({
				consumer: {
					slug: consumer.slug,
					name: consumer.name,
					rateLimitPerMinute: consumer.rateLimitPerMinute,
					allowedRoutes: consumer.allowedRoutes.length === 0 ? 'all' : consumer.allowedRoutes.map((route) => route.pathPrefix),
					activeKeys,
				},
				window: usage.window,
				totals: compactTotals(usage.totals),
				series: compactTraffic(usage.series),
				routes: usage.routes,
			});
		},
	};
}
