import { Prisma } from '@prisma/control-plane-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_SERVICES } from '../domain/gateway-config-limits.js';
import type { ServiceRepository } from '../infrastructure/service.repository.js';
import { buildFakePrisma, buildFakeRecorder, buildFakeRuntime, buildServiceRow, TRANSACTION } from './gateway-config-test-kit.fake.js';
import { ServicesService } from './services.service.js';

const ACTOR = { email: 'ops@pyle.local' };

function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
	return new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' });
}

function buildFakes() {
	const repository = {
		listActive: vi.fn().mockResolvedValue([buildServiceRow()]),
		findActiveBySlug: vi.fn().mockResolvedValue(null),
		countActive: vi.fn().mockResolvedValue(0),
		create: vi.fn().mockResolvedValue(buildServiceRow({ instances: [], _count: { routes: 0 } })),
		update: vi.fn().mockResolvedValue(buildServiceRow({ timeoutMs: 2000 })),
		softDeleteWithInstances: vi.fn().mockResolvedValue(undefined),
	};
	const recorder = buildFakeRecorder();
	const runtime = buildFakeRuntime();
	const service = new ServicesService(buildFakePrisma(), repository as unknown as ServiceRepository, recorder, runtime);

	return { service, repository, recorder, runtime };
}

describe('ServicesService', () => {
	let fakes: ReturnType<typeof buildFakes>;

	beforeEach(() => {
		fakes = buildFakes();
	});

	it('lists services with the live state of all their instances in one read', async () => {
		const services = await fakes.service.list();

		expect(services.map((service) => service.slug)).toEqual(['orders']);
		expect(fakes.runtime.load).toHaveBeenCalledWith(['i1']);
	});

	it('creates a service, audits it in the same transaction and announces it after', async () => {
		const created = await fakes.service.create({ slug: 'orders', name: 'Pedidos' }, ACTOR);

		expect(created.slug).toBe('orders');
		expect(fakes.repository.create).toHaveBeenCalledWith({ slug: 'orders', name: 'Pedidos' }, TRANSACTION);
		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ entityType: 'service', entityId: 's1', action: 'created', detail: { kind: 'created' } }),
			ACTOR,
			TRANSACTION,
		);
		expect(fakes.recorder.announce).toHaveBeenCalledOnce();
	});

	it('refuses a slug already in use, found before writing', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow());

		await expect(fakes.service.create({ slug: 'orders', name: 'x' }, ACTOR)).rejects.toThrow(ConfigConflictError);
		expect(fakes.repository.create).not.toHaveBeenCalled();
	});

	it('turns the race lost at the unique index into the same conflict', async () => {
		fakes.repository.create.mockRejectedValue(uniqueViolation());

		await expect(fakes.service.create({ slug: 'orders', name: 'x' }, ACTOR)).rejects.toThrow(ConfigConflictError);
		expect(fakes.recorder.announce).not.toHaveBeenCalled();
	});

	it('lets any other write failure through as it is', async () => {
		fakes.repository.create.mockRejectedValue(new Error('db down'));

		await expect(fakes.service.create({ slug: 'orders', name: 'x' }, ACTOR)).rejects.toThrow('db down');
	});

	it('refuses to grow past the service limit', async () => {
		fakes.repository.countActive.mockResolvedValue(MAX_SERVICES);

		await expect(fakes.service.create({ slug: 'orders', name: 'x' }, ACTOR)).rejects.toThrow(/maximum/);
	});

	it.each([[{ healthCheckIntervalMs: 2000, healthCheckTimeoutMs: 2000 }], [{ healthCheckIntervalMs: 1500 }], [{ healthCheckTimeoutMs: 6000 }]])(
		'refuses a health check that could outlast its interval %o',
		async (timing) => {
			await expect(fakes.service.create({ slug: 'orders', name: 'x', ...timing }, ACTOR)).rejects.toThrow(ConfigValidationError);
		},
	);

	it('updates a service and records only what changed', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow());

		const updated = await fakes.service.update('orders', { timeoutMs: 2000 }, ACTOR);

		expect(updated.timeoutMs).toBe(2000);
		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'updated', detail: { kind: 'fields', changes: [{ field: 'timeoutMs', before: 10000, after: 2000 }] } }),
			ACTOR,
			TRANSACTION,
		);
	});

	it('checks an update against the timing it would leave in place', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow({ healthCheckIntervalMs: 3000 }));

		await expect(fakes.service.update('orders', { healthCheckTimeoutMs: 3000 }, ACTOR)).rejects.toThrow(ConfigValidationError);
	});

	it('will not change the scaling profile under managed replicas', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow({ scalingProfile: 'demo_orders', desiredManagedReplicas: 2 }));

		await expect(fakes.service.update('orders', { scalingProfile: 'demo_users' }, ACTOR)).rejects.toThrow('scale it to 0');
		await expect(fakes.service.update('orders', { scalingProfile: 'demo_orders', timeoutMs: 2000 }, ACTOR)).resolves.toBeDefined();
	});

	it('changes the scaling profile of a service without managed replicas', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow({ scalingProfile: null }));

		await expect(fakes.service.update('orders', { scalingProfile: 'demo_orders' }, ACTOR)).resolves.toBeDefined();
	});

	it('will not delete a service a route still uses', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow({ _count: { routes: 2 } }));

		await expect(fakes.service.delete('orders', ACTOR)).rejects.toThrow(/2 route/);
		expect(fakes.repository.softDeleteWithInstances).not.toHaveBeenCalled();
	});

	it('soft-deletes an unused service with its instances', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow({ _count: { routes: 0 } }));

		await fakes.service.delete('orders', ACTOR);

		expect(fakes.repository.softDeleteWithInstances).toHaveBeenCalledWith('s1', TRANSACTION, expect.any(Date));
		expect(fakes.recorder.announce).toHaveBeenCalledWith([
			expect.objectContaining({ entityType: 'service', entityId: 's1', action: 'deleted', detail: { kind: 'deleted' } }),
		]);
	});

	it('answers not found for an unknown slug', async () => {
		await expect(fakes.service.get('ghost')).rejects.toThrow(ConfigNotFoundError);
	});

	it('reads one service with the live state of its instances', async () => {
		fakes.repository.findActiveBySlug.mockResolvedValue(buildServiceRow());

		expect((await fakes.service.get('orders')).instances).toHaveLength(1);
		expect(fakes.runtime.load).toHaveBeenCalledWith(['i1']);
	});
});
