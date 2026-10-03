import { Injectable } from '@nestjs/common';
import type { HttpMethod, Prisma, Route } from '@prisma/control-plane-client';

import { isValidPathPrefix } from '@pyle/shared/contracts/path-prefix.js';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { CREATED, DELETED, diffFields, type ConfigChangeDetail } from '../domain/config-change-detail.js';
import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_ROUTES } from '../domain/gateway-config-limits.js';
import { isUniqueViolation } from '../domain/unique-violation.js';
import { RouteRepository, type RouteWithService } from '../infrastructure/route.repository.js';
import { toRouteDto, type RouteDto } from '../interface/dto/gateway-config-responses.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from './config-change-recorder.js';
import { ServicesService } from './services.service.js';

type RouteSettingsInput = {
	readonly name?: string;
	readonly pathPrefix?: string;
	readonly serviceSlug?: string;
	readonly stripPrefix?: boolean;
	readonly methods?: readonly HttpMethod[];
	readonly isAuthRequired?: boolean;
	readonly rateLimitPerMinute?: number | null;
	readonly timeoutMs?: number | null;
};

type CreateRouteInput = RouteSettingsInput & { readonly name: string; readonly pathPrefix: string; readonly serviceSlug: string };

type UpdateRouteInput = RouteSettingsInput;

// The service by name: an id in the history would mean nothing to whoever reads it.
type RouteAuditView = Omit<Route, 'serviceId'> & { readonly service: string };

const AUDITED_FIELDS = [
	'name',
	'pathPrefix',
	'service',
	'stripPrefix',
	'methods',
	'isAuthRequired',
	'rateLimitPerMinute',
	'timeoutMs',
] as const satisfies readonly (keyof RouteAuditView)[];

@Injectable()
export class RoutesService {
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly routes: RouteRepository,
		private readonly services: ServicesService,
		private readonly recorder: ConfigChangeRecorder,
	) {}

	async list(): Promise<readonly RouteDto[]> {
		const routes = await this.routes.listActive();

		return routes.map(toRouteDto);
	}

	async get(id: string): Promise<RouteDto> {
		return toRouteDto(await this.findOrThrow(id));
	}

	async create(input: CreateRouteInput, actor: ConfigActor): Promise<RouteDto> {
		assertValidPrefix(input.pathPrefix);
		await this.assertPrefixFree(input.pathPrefix);
		const routeCount = await this.routes.countActive();

		if (routeCount >= MAX_ROUTES) {
			throw new ConfigConflictError(`The gateway already has the maximum of ${MAX_ROUTES} routes`);
		}

		const service = await this.services.findOrThrow(input.serviceSlug);
		const { serviceSlug: _serviceSlug, methods, ...settings } = input;
		const data: Prisma.RouteUncheckedCreateInput = { ...settings, methods: uniqueMethods(methods), serviceId: service.id };
		const created = await this.writeUnique(input.pathPrefix, async (transaction) => {
			const route = await this.routes.create(data, transaction);

			await this.recorder.record(toRouteChange(route, 'created', CREATED), actor, transaction);

			return route;
		});

		await this.recorder.announce([toRouteChange(created, 'created', CREATED)]);

		return toRouteDto(created);
	}

	async update(id: string, input: UpdateRouteInput, actor: ConfigActor): Promise<RouteDto> {
		const current = await this.findOrThrow(id);
		const isMovingPrefix = input.pathPrefix !== undefined && input.pathPrefix !== current.pathPrefix;

		if (isMovingPrefix) {
			const pathPrefix = input.pathPrefix ?? current.pathPrefix;

			assertValidPrefix(pathPrefix);
			await this.assertPrefixFree(pathPrefix);
		}

		const serviceId = await this.resolveServiceId(input.serviceSlug);
		const { serviceSlug: _serviceSlug, methods, ...settings } = input;
		const data: Prisma.RouteUncheckedUpdateInput = { ...settings, methods: uniqueMethods(methods), serviceId };
		const updated = await this.writeUnique(input.pathPrefix ?? current.pathPrefix, async (transaction) => {
			const route = await this.routes.update(current.id, data, transaction);
			const detail = diffFields(toAuditView(current), toAuditView(route), AUDITED_FIELDS);
			const change = toRouteChange(route, 'updated', detail);

			await this.recorder.record(change, actor, transaction);

			return { route, change };
		});

		await this.recorder.announce([updated.change]);

		return toRouteDto(updated.route);
	}

	// Soft delete; the route answers 404 at the gateway as soon as it reloads.
	async delete(id: string, actor: ConfigActor): Promise<void> {
		const route = await this.findOrThrow(id);
		const change = toRouteChange(route, 'deleted', DELETED);

		await this.prisma.transaction(async (transaction) => {
			await this.routes.softDelete(route.id, new Date(), transaction);
			await this.recorder.record(change, actor, transaction);
		});
		await this.recorder.announce([change]);
	}

	private async findOrThrow(id: string): Promise<RouteWithService> {
		const route = await this.routes.findActiveById(id);

		if (!route) {
			throw new ConfigNotFoundError(`No route with id "${id}"`);
		}

		return route;
	}

	// Undefined leaves the route's service as it is.
	private async resolveServiceId(serviceSlug: string | undefined): Promise<string | undefined> {
		if (serviceSlug === undefined) {
			return undefined;
		}

		const service = await this.services.findOrThrow(serviceSlug);

		return service.id;
	}

	private async assertPrefixFree(pathPrefix: string): Promise<void> {
		const existing = await this.routes.findActiveByPrefix(pathPrefix);

		if (existing) {
			throw new ConfigConflictError(`Route "${existing.name}" already uses the prefix ${pathPrefix}`);
		}
	}

	private async writeUnique<R>(pathPrefix: string, work: (transaction: Prisma.TransactionClient) => Promise<R>): Promise<R> {
		try {
			return await this.prisma.transaction(work);
		} catch (error) {
			if (isUniqueViolation(error)) {
				throw new ConfigConflictError(`Another route already uses the prefix ${pathPrefix}`);
			}

			throw error;
		}
	}
}

function toAuditView(route: RouteWithService): RouteAuditView {
	const { serviceId: _serviceId, ...settings } = route;

	return { ...settings, service: route.service.name };
}

function toRouteChange(
	route: { readonly id: string; readonly name: string },
	action: ConfigChange['action'],
	detail: ConfigChangeDetail,
): ConfigChange {
	return { entityType: 'route', entityId: route.id, entityName: route.name, action, detail };
}

function assertValidPrefix(pathPrefix: string): void {
	if (isValidPathPrefix(pathPrefix)) {
		return;
	}

	throw new ConfigValidationError('pathPrefix must start with "/", have no trailing "/", and use only lowercase letters, digits, "-", "_" and "/"');
}

// A repeated method would read as a mistake in the console; the set is what matters.
function uniqueMethods(methods: readonly HttpMethod[] | undefined): HttpMethod[] | undefined {
	if (methods === undefined) {
		return undefined;
	}

	return [...new Set(methods)];
}
