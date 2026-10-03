import { isValidPathPrefix } from '@pyle/shared/contracts/path-prefix.js';

import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import { checkChanged, checkOptionalRange, RANGES } from '../validate-proposal.js';
import { findRoute, PATH_PREFIX, readFlag, readNullableNumber, SERVICE_SLUG, type ProposalSpec, type ProposalToolDependencies } from './shared.js';

export function routeSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { routes, services } = dependencies;

	return [
		{
			name: 'propose_route_timeout',
			description: "Proposes a route's own timeout (100-60000 ms); omit timeoutMs to fall back to the service's.",
			properties: { pathPrefix: PATH_PREFIX, timeoutMs: { type: 'integer', minimum: RANGES.routeTimeoutMs.min, maximum: RANGES.routeTimeoutMs.max } },
			required: ['pathPrefix'],
			build: async (input, reason) => {
				const route = await findRoute(routes, readRequiredString(input, 'pathPrefix'));

				if (typeof route === 'string') {
					return route;
				}

				const timeoutMs = readNullableNumber(input, 'timeoutMs');
				const problem =
					checkOptionalRange('timeoutMs', timeoutMs, RANGES.routeTimeoutMs) ??
					checkChanged(`the timeout of ${route.pathPrefix}`, route.timeoutMs, timeoutMs);

				return problem ?? { type: 'set_route_timeout', routeId: route.id, routeName: route.name, timeoutMs, reason };
			},
		},
		{
			name: 'propose_route_rate_limit',
			description:
				"Proposes a per-consumer limit on one route (requests per minute, 1-100000), on top of each consumer's own; omit rateLimitPerMinute to remove it.",
			properties: {
				pathPrefix: PATH_PREFIX,
				rateLimitPerMinute: { type: 'integer', minimum: RANGES.routeRateLimit.min, maximum: RANGES.routeRateLimit.max },
			},
			required: ['pathPrefix'],
			build: async (input, reason) => {
				const route = await findRoute(routes, readRequiredString(input, 'pathPrefix'));

				if (typeof route === 'string') {
					return route;
				}

				const rateLimitPerMinute = readNullableNumber(input, 'rateLimitPerMinute');
				const problem =
					checkOptionalRange('rateLimitPerMinute', rateLimitPerMinute, RANGES.routeRateLimit) ??
					checkChanged(`the limit of ${route.pathPrefix}`, route.rateLimitPerMinute, rateLimitPerMinute);

				return problem ?? { type: 'set_route_rate_limit', routeId: route.id, routeName: route.name, rateLimitPerMinute, reason };
			},
		},
		{
			name: 'propose_create_route',
			description: 'Proposes a new route: a path prefix sent to an existing service.',
			properties: { name: { type: 'string' }, pathPrefix: PATH_PREFIX, serviceSlug: SERVICE_SLUG, isAuthRequired: { type: 'boolean' } },
			required: ['name', 'pathPrefix', 'serviceSlug', 'isAuthRequired'],
			build: async (input, reason) => {
				const pathPrefix = readRequiredString(input, 'pathPrefix');

				if (!isValidPathPrefix(pathPrefix)) {
					return `${pathPrefix} is not a valid prefix (lowercase segments like /api/orders, no trailing slash)`;
				}

				const existing = await findRoute(routes, pathPrefix);

				if (typeof existing !== 'string') {
					return `route ${existing.name} already uses ${pathPrefix}`;
				}

				const service = await services.get(readRequiredString(input, 'serviceSlug'));

				return {
					type: 'create_route',
					name: readRequiredString(input, 'name'),
					pathPrefix,
					serviceSlug: service.slug,
					isAuthRequired: readFlag(input, 'isAuthRequired'),
					reason,
				};
			},
		},
	];
}
