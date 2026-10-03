import { ApiProperty, type ApiPropertyOptions } from '@nestjs/swagger';
import {
	HttpMethod,
	type ApiKey,
	type ConfigChangeEvent,
	type LoadBalancingStrategy,
	type ManagedInstanceState,
	type ScalingProfile,
	type ServiceInstance,
} from '@prisma/control-plane-client';

import type { ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import type { InstanceCircuitStatus, InstanceHealthStatus, InstanceLiveState } from '@pyle/shared/contracts/instance-live-state.js';

import type { Page } from '../../../common/pagination.js';
import { readChangeDetail, type ConfigChangeDetail } from '../../domain/config-change-detail.js';
import type { ConsumerWithKeysAndRoutes } from '../../infrastructure/consumer.repository.js';
import type { RouteWithService } from '../../infrastructure/route.repository.js';
import type { ServiceWithInstances } from '../../infrastructure/service.repository.js';
import { ChaosStateDto } from './chaos.dto.js';

// A discriminated union the Swagger plugin cannot express: described, not typed.
const CHANGE_DETAIL_SCHEMA: ApiPropertyOptions = {
	description:
		'What the change did, discriminated by `kind`: created, deleted, fields (changes: field/before/after), key_issued, key_revoked, key_restored, route_scope, chaos, alert_rule, managed_replicas, replica_running, replica_draining, replica_failed',
	type: 'object',
	additionalProperties: true,
	nullable: true,
};

// Never the Prisma rows: key hashes, deletedAt and container names stay on the server.
// Classes, not type aliases, so the Swagger plugin documents them; the mappers below
// still return plain object literals (classes are structural).

export type InstanceRuntime = {
	readonly liveByInstanceId: ReadonlyMap<string, InstanceLiveState>;
	readonly chaosByInstanceId: ReadonlyMap<string, ChaosState>;
};

// The documented shape of the gateway contract's InstanceLiveState.
class InstanceLiveStateDto implements InstanceLiveState {
	readonly instanceId!: string;
	readonly gatewayId!: string;
	readonly health!: InstanceHealthStatus;
	readonly circuit!: InstanceCircuitStatus;
	readonly inFlight!: number;
	readonly consecutiveFailures!: number;
	readonly lastCheckAt!: string | null;
	readonly lastCheckLatencyMs!: number | null;
	readonly updatedAt!: string;
}

export class InstanceDto {
	readonly id!: string;
	readonly serviceId!: string;
	readonly name!: string;
	readonly url!: string;
	readonly weight!: number;
	readonly isEnabled!: boolean;
	readonly source!: 'static' | 'managed';
	// Only for managed instances.
	readonly scalingState!: ManagedInstanceState | null;
	// Null when no gateway reported the instance yet.
	readonly live!: InstanceLiveStateDto | null;
	readonly chaos!: ChaosStateDto | null;
	readonly createdAt!: string;
	readonly updatedAt!: string;
}

class ServiceHealthCheckDto {
	readonly path!: string;
	readonly intervalMs!: number;
	readonly timeoutMs!: number;
	readonly healthyThreshold!: number;
	readonly unhealthyThreshold!: number;
}

class ServiceCircuitDto {
	readonly failureThreshold!: number;
	readonly cooldownMs!: number;
}

class ServiceScalingDto {
	readonly profile!: ScalingProfile | null;
	readonly desiredManagedReplicas!: number;
}

export class ServiceDto {
	readonly id!: string;
	readonly slug!: string;
	readonly name!: string;
	readonly description!: string | null;
	readonly lbStrategy!: LoadBalancingStrategy;
	readonly timeoutMs!: number;
	readonly retryMaxAttempts!: number;
	readonly healthCheck!: ServiceHealthCheckDto;
	readonly circuit!: ServiceCircuitDto;
	readonly scaling!: ServiceScalingDto;
	@ApiProperty({ type: [InstanceDto] })
	readonly instances!: readonly InstanceDto[];
	readonly routeCount!: number;
	readonly createdAt!: string;
	readonly updatedAt!: string;
}

class RouteServiceRefDto {
	readonly id!: string;
	readonly slug!: string;
	readonly name!: string;
}

export class RouteDto {
	readonly id!: string;
	readonly name!: string;
	readonly pathPrefix!: string;
	readonly service!: RouteServiceRefDto;
	readonly stripPrefix!: boolean;
	@ApiProperty({ enum: HttpMethod, isArray: true })
	readonly methods!: readonly HttpMethod[];
	readonly isAuthRequired!: boolean;
	readonly rateLimitPerMinute!: number | null;
	readonly timeoutMs!: number | null;
	readonly createdAt!: string;
	readonly updatedAt!: string;
}

export class ApiKeyDto {
	readonly id!: string;
	readonly keyPrefix!: string;
	readonly label!: string | null;
	readonly createdAt!: string;
	readonly lastUsedAt!: string | null;
	readonly revokedAt!: string | null;
}

// The only responses that carry a key in clear, right after it was made.
export class ApiKeyCreatedDto extends ApiKeyDto {
	readonly key!: string;
}

class AllowedRouteDto {
	readonly id!: string;
	readonly name!: string;
	readonly pathPrefix!: string;
}

export class ConsumerDto {
	readonly id!: string;
	readonly slug!: string;
	readonly name!: string;
	readonly rateLimitPerMinute!: number;
	// Empty = every route.
	@ApiProperty({ type: [AllowedRouteDto] })
	readonly allowedRoutes!: readonly AllowedRouteDto[];
	@ApiProperty({ type: [ApiKeyDto] })
	readonly apiKeys!: readonly ApiKeyDto[];
	readonly createdAt!: string;
	readonly updatedAt!: string;
}

export class ConsumerCreatedDto extends ConsumerDto {
	readonly key!: string;
}

export class ConsumerPageDto implements Page<ConsumerDto> {
	@ApiProperty({ type: [ConsumerDto] })
	readonly items!: readonly ConsumerDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
}

export class ConfigChangeEventDto {
	readonly id!: string;
	readonly entityType!: ConfigChangeEvent['entityType'];
	readonly entityId!: string;
	readonly entityName!: string | null;
	readonly action!: ConfigChangeEvent['action'];
	readonly summary!: string;
	// Null on rows written before it was recorded: show the summary instead.
	@ApiProperty(CHANGE_DETAIL_SCHEMA)
	readonly detail!: ConfigChangeDetail | null;
	readonly actorEmail!: string | null;
	readonly occurredAt!: string;
}

export class ConfigChangeEventPageDto implements Page<ConfigChangeEventDto> {
	@ApiProperty({ type: [ConfigChangeEventDto] })
	readonly items!: readonly ConfigChangeEventDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
}

export const NO_RUNTIME: InstanceRuntime = { liveByInstanceId: new Map(), chaosByInstanceId: new Map() };

export function toInstanceDto(instance: ServiceInstance, runtime: InstanceRuntime): InstanceDto {
	return {
		id: instance.id,
		serviceId: instance.serviceId,
		name: instance.name,
		url: instance.url,
		weight: instance.weight,
		isEnabled: instance.isEnabled,
		source: instance.source,
		scalingState: instance.scalingState,
		live: runtime.liveByInstanceId.get(instance.id) ?? null,
		chaos: runtime.chaosByInstanceId.get(instance.id) ?? null,
		createdAt: instance.createdAt.toISOString(),
		updatedAt: instance.updatedAt.toISOString(),
	};
}

export function toServiceDto(service: ServiceWithInstances, runtime: InstanceRuntime): ServiceDto {
	return {
		id: service.id,
		slug: service.slug,
		name: service.name,
		description: service.description,
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
		scaling: { profile: service.scalingProfile, desiredManagedReplicas: service.desiredManagedReplicas },
		instances: service.instances.map((instance) => toInstanceDto(instance, runtime)),
		routeCount: service._count.routes,
		createdAt: service.createdAt.toISOString(),
		updatedAt: service.updatedAt.toISOString(),
	};
}

export function toRouteDto(route: RouteWithService): RouteDto {
	return {
		id: route.id,
		name: route.name,
		pathPrefix: route.pathPrefix,
		service: { id: route.service.id, slug: route.service.slug, name: route.service.name },
		stripPrefix: route.stripPrefix,
		methods: route.methods,
		isAuthRequired: route.isAuthRequired,
		rateLimitPerMinute: route.rateLimitPerMinute,
		timeoutMs: route.timeoutMs,
		createdAt: route.createdAt.toISOString(),
		updatedAt: route.updatedAt.toISOString(),
	};
}

export function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
	return {
		id: apiKey.id,
		keyPrefix: apiKey.keyPrefix,
		label: apiKey.label,
		createdAt: apiKey.createdAt.toISOString(),
		lastUsedAt: toIso(apiKey.lastUsedAt),
		revokedAt: toIso(apiKey.revokedAt),
	};
}

export function toConsumerDto(consumer: ConsumerWithKeysAndRoutes): ConsumerDto {
	return {
		id: consumer.id,
		slug: consumer.slug,
		name: consumer.name,
		rateLimitPerMinute: consumer.rateLimitPerMinute,
		allowedRoutes: consumer.routeAccess.map(({ route }) => ({ id: route.id, name: route.name, pathPrefix: route.pathPrefix })),
		apiKeys: consumer.apiKeys.map(toApiKeyDto),
		createdAt: consumer.createdAt.toISOString(),
		updatedAt: consumer.updatedAt.toISOString(),
	};
}

export function toConfigChangeEventDto(event: ConfigChangeEvent): ConfigChangeEventDto {
	return {
		id: event.id,
		entityType: event.entityType,
		entityId: event.entityId,
		entityName: event.entityName,
		action: event.action,
		summary: event.summary,
		detail: readChangeDetail(event.detail),
		actorEmail: event.actorEmail,
		occurredAt: event.occurredAt.toISOString(),
	};
}

function toIso(date: Date | null): string | null {
	if (date === null) {
		return null;
	}

	return date.toISOString();
}
