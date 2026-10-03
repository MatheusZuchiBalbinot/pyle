import type { ConsumerConfig, GatewayConfigSnapshot, RouteConfig, ServiceConfig } from '@pyle/shared/contracts/config-snapshot.js';
import { matchesPrefix } from '@pyle/shared/contracts/path-prefix.js';

export type RouteMatch = {
	readonly route: RouteConfig;
	readonly service: ServiceConfig;
};

type IndexedRoute = RouteMatch;

// Built once per configuration load; routes sorted longest prefix first, so the first match
// is the most specific.
export class RouteTable {
	private readonly routes: readonly IndexedRoute[];
	private readonly consumersById: ReadonlyMap<string, ConsumerConfig>;

	constructor(readonly snapshot: GatewayConfigSnapshot) {
		const servicesById = new Map(snapshot.services.map((service) => [service.id, service]));

		this.routes = snapshot.routes
			.flatMap((route): IndexedRoute[] => {
				const service = servicesById.get(route.serviceId);

				return service ? [{ route, service }] : [];
			})
			.sort((left, right) => right.route.pathPrefix.length - left.route.pathPrefix.length);
		this.consumersById = new Map(snapshot.consumers.map((consumer) => [consumer.id, consumer]));
	}

	match(path: string): RouteMatch | null {
		return this.routes.find(({ route }) => matchesPrefix(path, route.pathPrefix)) ?? null;
	}

	consumer(consumerId: string): ConsumerConfig | null {
		return this.consumersById.get(consumerId) ?? null;
	}
}
