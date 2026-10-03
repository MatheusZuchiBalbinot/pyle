import type { Consumer, PrismaClient, Route, Service, ServiceInstance } from '@prisma/control-plane-client';

import type { ConsumerConfig, GatewayConfigSnapshot, InstanceConfig, RouteConfig, ServiceConfig } from '../contracts/config-snapshot.js';

const ACTIVE = { deletedAt: null } as const;

// A narrow slice of the Prisma client, so tests can pass plain rows.
export type ConfigSource = {
	readonly service: Pick<PrismaClient['service'], 'findMany'>;
	readonly route: Pick<PrismaClient['route'], 'findMany'>;
	readonly consumer: Pick<PrismaClient['consumer'], 'findMany'>;
};
type ServiceRow = Service & { readonly instances: readonly ServiceInstance[] };

type ConsumerRow = Consumer & { readonly routeAccess: readonly { readonly routeId: string }[] };

// Three queries, whatever the size of the configuration (no N+1). Routes of
// a deleted service are left out: they could only ever answer 503.
export async function loadGatewayConfig(source: ConfigSource, now: number): Promise<GatewayConfigSnapshot> {
	const [services, routes, consumers] = await Promise.all([
		source.service.findMany({ where: ACTIVE, include: { instances: { where: ACTIVE, orderBy: { name: 'asc' } } } }),
		source.route.findMany({ where: { ...ACTIVE, service: ACTIVE } }),
		source.consumer.findMany({ where: ACTIVE, include: { routeAccess: { where: { route: ACTIVE }, select: { routeId: true } } } }),
	]);
	const instances = services.flatMap((service) => service.instances);
	const version = Math.max(newestUpdate(services), newestUpdate(instances), newestUpdate(routes), newestUpdate(consumers));

	return {
		version,
		loadedAt: now,
		services: services.map(toServiceConfig),
		routes: routes.map(toRouteConfig),
		consumers: consumers.map(toConsumerConfig),
	};
}

function toInstanceConfig(instance: ServiceInstance): InstanceConfig {
	return {
		id: instance.id,
		serviceId: instance.serviceId,
		name: instance.name,
		url: instance.url,
		weight: instance.weight,
		isEnabled: instance.isEnabled,
	};
}

function toServiceConfig(service: ServiceRow): ServiceConfig {
	return {
		id: service.id,
		slug: service.slug,
		lbStrategy: service.lbStrategy,
		timeoutMs: service.timeoutMs,
		retryMaxAttempts: service.retryMaxAttempts,
		healthCheck: {
			path: service.healthCheckPath,
			intervalMs: service.healthCheckIntervalMs,
			timeoutMs: service.healthCheckTimeoutMs,
			healthyThreshold: service.healthyThreshold,
			unhealthyThreshold: service.unhealthyThreshold,
		},
		circuit: { failureThreshold: service.circuitFailureThreshold, cooldownMs: service.circuitCooldownMs },
		instances: service.instances.map(toInstanceConfig),
	};
}

function toRouteConfig(route: Route): RouteConfig {
	return {
		id: route.id,
		name: route.name,
		pathPrefix: route.pathPrefix,
		serviceId: route.serviceId,
		stripPrefix: route.stripPrefix,
		methods: route.methods,
		isAuthRequired: route.isAuthRequired,
		rateLimitPerMinute: route.rateLimitPerMinute,
		timeoutMs: route.timeoutMs,
	};
}

function toConsumerConfig(consumer: ConsumerRow): ConsumerConfig {
	return {
		id: consumer.id,
		slug: consumer.slug,
		rateLimitPerMinute: consumer.rateLimitPerMinute,
		allowedRouteIds: consumer.routeAccess.map((access) => access.routeId),
	};
}

function newestUpdate(rows: readonly { readonly updatedAt: Date }[]): number {
	return rows.reduce((newest, row) => Math.max(newest, row.updatedAt.getTime()), 0);
}
