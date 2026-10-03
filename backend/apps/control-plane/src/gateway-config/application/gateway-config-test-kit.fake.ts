import type { ApiKey, Consumer, Route, Service, ServiceInstance } from '@prisma/control-plane-client';
import { vi } from 'vitest';

import type { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { ConsumerWithKeysAndRoutes } from '../infrastructure/consumer.repository.js';
import type { RouteWithService } from '../infrastructure/route.repository.js';
import type { ServiceWithInstances } from '../infrastructure/service.repository.js';
import { NO_RUNTIME } from '../interface/dto/gateway-config-responses.js';
import type { ConfigChangeRecorder } from './config-change-recorder.js';
import type { InstanceRuntimeService } from './instance-runtime.service.js';

// Test doubles; *.fake.ts stays out of the production build.

const AT = new Date('2026-09-25T10:00:00.000Z');

// What the fake transaction hands its work, so a spec can assert that a
// repository call ran inside it.
export const TRANSACTION = { isFakeTransaction: true } as const;

export function buildFakePrisma(): ControlPlanePrismaService {
	return {
		transaction: vi.fn(async (work: (transaction: unknown) => Promise<unknown>) => work(TRANSACTION)),
	} as unknown as ControlPlanePrismaService;
}

export function buildFakeRecorder(): ConfigChangeRecorder {
	return { record: vi.fn().mockResolvedValue(undefined), announce: vi.fn().mockResolvedValue(undefined) } as unknown as ConfigChangeRecorder;
}

export function buildFakeRuntime(): InstanceRuntimeService {
	return { load: vi.fn().mockResolvedValue(NO_RUNTIME) } as unknown as InstanceRuntimeService;
}

export function buildInstanceRow(overrides: Partial<ServiceInstance> = {}): ServiceInstance {
	return {
		id: 'i1',
		serviceId: 's1',
		name: 'orders-1',
		url: 'http://localhost:48101',
		weight: 1,
		isEnabled: true,
		source: 'static',
		containerName: null,
		hostPort: null,
		scalingState: null,
		createdAt: AT,
		updatedAt: AT,
		deletedAt: null,
		...overrides,
	};
}

export function buildServiceRow(overrides: Partial<ServiceWithInstances> = {}): ServiceWithInstances {
	const service: Service = {
		id: 's1',
		slug: 'orders',
		name: 'Pedidos',
		description: null,
		lbStrategy: 'round_robin',
		timeoutMs: 10_000,
		retryMaxAttempts: 2,
		healthCheckPath: '/health',
		healthCheckIntervalMs: 5000,
		healthCheckTimeoutMs: 2000,
		healthyThreshold: 2,
		unhealthyThreshold: 3,
		circuitFailureThreshold: 5,
		circuitCooldownMs: 15_000,
		createdAt: AT,
		updatedAt: AT,
		scalingProfile: null,
		desiredManagedReplicas: 0,
		deletedAt: null,
	};

	return { ...service, instances: [buildInstanceRow()], _count: { routes: 1 }, ...overrides };
}

export function buildRouteRow(overrides: Partial<Route> = {}): RouteWithService {
	const route: Route = {
		id: 'r1',
		name: 'Pedidos',
		pathPrefix: '/api/orders',
		serviceId: 's1',
		stripPrefix: true,
		methods: [],
		isAuthRequired: true,
		rateLimitPerMinute: null,
		timeoutMs: null,
		createdAt: AT,
		updatedAt: AT,
		deletedAt: null,
		...overrides,
	};

	return { ...route, service: buildServiceRow() };
}

export function buildApiKeyRow(overrides: Partial<ApiKey> = {}): ApiKey {
	return {
		id: 'k1',
		consumerId: 'c1',
		keyHash: 'hash',
		keyPrefix: 'pyle_live_Ab',
		label: null,
		createdAt: AT,
		lastUsedAt: null,
		revokedAt: null,
		...overrides,
	};
}

export function buildConsumerRow(overrides: Partial<ConsumerWithKeysAndRoutes> = {}): ConsumerWithKeysAndRoutes {
	const consumer: Consumer = {
		id: 'c1',
		slug: 'web-app',
		name: 'Web app',
		rateLimitPerMinute: 600,
		createdAt: AT,
		updatedAt: AT,
		deletedAt: null,
	};

	return { ...consumer, apiKeys: [buildApiKeyRow()], routeAccess: [], ...overrides };
}
