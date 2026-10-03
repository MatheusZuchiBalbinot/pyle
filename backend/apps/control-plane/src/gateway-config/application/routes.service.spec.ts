import { Prisma } from '@prisma/control-plane-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_ROUTES } from '../domain/gateway-config-limits.js';
import type { RouteRepository } from '../infrastructure/route.repository.js';
import { buildFakePrisma, buildFakeRecorder, buildRouteRow, buildServiceRow, TRANSACTION } from './gateway-config-test-kit.fake.js';
import { RoutesService } from './routes.service.js';
import type { ServicesService } from './services.service.js';

const ACTOR = { email: 'ops@pyle.local' };
const CREATE = { name: 'Pedidos', pathPrefix: '/api/orders', serviceSlug: 'orders' };

function buildFakes() {
	const repository = {
		listActive: vi.fn().mockResolvedValue([buildRouteRow()]),
		findActiveById: vi.fn().mockResolvedValue(buildRouteRow()),
		findActiveByPrefix: vi.fn().mockResolvedValue(null),
		countActive: vi.fn().mockResolvedValue(0),
		create: vi.fn().mockResolvedValue(buildRouteRow()),
		update: vi.fn().mockResolvedValue(buildRouteRow({ timeoutMs: 2000 })),
		softDelete: vi.fn().mockResolvedValue(undefined),
	};
	const services = { findOrThrow: vi.fn().mockResolvedValue(buildServiceRow({ id: 's2', slug: 'users' })) };
	const recorder = buildFakeRecorder();
	const routes = new RoutesService(buildFakePrisma(), repository as unknown as RouteRepository, services as unknown as ServicesService, recorder);

	return { routes, repository, services, recorder };
}

describe('RoutesService', () => {
	let fakes: ReturnType<typeof buildFakes>;

	beforeEach(() => {
		fakes = buildFakes();
	});

	it('lists and reads routes', async () => {
		expect((await fakes.routes.list()).map((route) => route.pathPrefix)).toEqual(['/api/orders']);
		expect((await fakes.routes.get('r1')).service.slug).toBe('orders');
	});

	it('creates a route on its service with each method once', async () => {
		await fakes.routes.create({ ...CREATE, methods: ['GET', 'POST', 'GET'] }, ACTOR);

		expect(fakes.repository.create).toHaveBeenCalledWith(
			{ name: 'Pedidos', pathPrefix: '/api/orders', methods: ['GET', 'POST'], serviceId: 's2' },
			TRANSACTION,
		);
		expect(fakes.recorder.announce).toHaveBeenCalledOnce();
	});

	it('refuses a malformed prefix even past the DTO', async () => {
		await expect(fakes.routes.create({ ...CREATE, pathPrefix: '/api/' }, ACTOR)).rejects.toThrow(ConfigValidationError);
	});

	it('names the route already using a prefix', async () => {
		fakes.repository.findActiveByPrefix.mockResolvedValue(buildRouteRow({ name: 'Antiga' }));

		await expect(fakes.routes.create(CREATE, ACTOR)).rejects.toThrow('Route "Antiga" already uses the prefix /api/orders');
	});

	it('refuses to grow past the route limit', async () => {
		fakes.repository.countActive.mockResolvedValue(MAX_ROUTES);

		await expect(fakes.routes.create(CREATE, ACTOR)).rejects.toThrow(/maximum/);
	});

	it('turns a lost race at the unique index into a conflict', async () => {
		fakes.repository.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }));

		await expect(fakes.routes.create(CREATE, ACTOR)).rejects.toThrow(ConfigConflictError);
	});

	it('lets any other write failure through', async () => {
		fakes.repository.create.mockRejectedValue(new Error('db down'));

		await expect(fakes.routes.create(CREATE, ACTOR)).rejects.toThrow('db down');
	});

	it('updates settings without touching the service or prefix when they are not given', async () => {
		await fakes.routes.update('r1', { timeoutMs: 2000 }, ACTOR);

		expect(fakes.services.findOrThrow).not.toHaveBeenCalled();
		expect(fakes.repository.findActiveByPrefix).not.toHaveBeenCalled();
		expect(fakes.repository.update).toHaveBeenCalledWith('r1', { timeoutMs: 2000, methods: undefined, serviceId: undefined }, TRANSACTION);
		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: null, after: 2000 }] } }),
			ACTOR,
			TRANSACTION,
		);
	});

	it('moves a route to a new prefix and service after checking both', async () => {
		await fakes.routes.update('r1', { pathPrefix: '/api/v2/orders', serviceSlug: 'users' }, ACTOR);

		expect(fakes.repository.findActiveByPrefix).toHaveBeenCalledWith('/api/v2/orders');
		expect(fakes.repository.update).toHaveBeenCalledWith(
			'r1',
			expect.objectContaining({ pathPrefix: '/api/v2/orders', serviceId: 's2' }),
			TRANSACTION,
		);
	});

	it('does not treat keeping its own prefix as a conflict', async () => {
		await fakes.routes.update('r1', { pathPrefix: '/api/orders' }, ACTOR);

		expect(fakes.repository.findActiveByPrefix).not.toHaveBeenCalled();
	});

	it('soft-deletes a route', async () => {
		await fakes.routes.delete('r1', ACTOR);

		expect(fakes.repository.softDelete).toHaveBeenCalledWith('r1', expect.any(Date), TRANSACTION);
	});

	it('answers not found for an unknown route', async () => {
		fakes.repository.findActiveById.mockResolvedValue(null);

		await expect(fakes.routes.delete('ghost', ACTOR)).rejects.toThrow(ConfigNotFoundError);
	});
});
