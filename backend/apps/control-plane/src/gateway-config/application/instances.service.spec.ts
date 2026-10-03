import { Prisma } from '@prisma/control-plane-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ConfigConflictError, ConfigNotFoundError, ConfigValidationError } from '../domain/config-errors.js';
import { MAX_INSTANCES_PER_SERVICE } from '../domain/gateway-config-limits.js';
import type { InstanceRepository } from '../infrastructure/instance.repository.js';
import {
	buildFakePrisma,
	buildFakeRecorder,
	buildFakeRuntime,
	buildInstanceRow,
	buildServiceRow,
	TRANSACTION,
} from './gateway-config-test-kit.fake.js';
import { InstancesService } from './instances.service.js';
import type { ServicesService } from './services.service.js';

const ACTOR = { email: null };
const SECOND = buildInstanceRow({ id: 'i2', name: 'orders-2' });

function buildFakes() {
	const service = buildServiceRow({ instances: [buildInstanceRow(), SECOND] });
	const services = { findOrThrow: vi.fn().mockResolvedValue(service) };
	const repository = {
		findActive: vi.fn().mockResolvedValue(buildInstanceRow()),
		findActiveByName: vi.fn().mockResolvedValue(null),
		countEnabled: vi.fn().mockResolvedValue(1),
		create: vi.fn().mockResolvedValue(buildInstanceRow({ id: 'i3', name: 'orders-3' })),
		update: vi.fn().mockResolvedValue(buildInstanceRow({ weight: 3 })),
		softDelete: vi.fn().mockResolvedValue(undefined),
	};
	const recorder = buildFakeRecorder();
	const instances = new InstancesService(
		buildFakePrisma(),
		services as unknown as ServicesService,
		repository as unknown as InstanceRepository,
		recorder,
		buildFakeRuntime(),
	);

	return { instances, services, repository, recorder };
}

describe('InstancesService', () => {
	let fakes: ReturnType<typeof buildFakes>;

	beforeEach(() => {
		fakes = buildFakes();
	});

	it('adds a static instance with its URL normalized', async () => {
		await fakes.instances.create('orders', { name: 'orders-3', url: ' http://localhost:48103/ ' }, ACTOR);

		expect(fakes.repository.create).toHaveBeenCalledWith(
			{ name: 'orders-3', url: 'http://localhost:48103', serviceId: 's1', source: 'static' },
			TRANSACTION,
		);
		expect(fakes.recorder.announce).toHaveBeenCalledWith([
			expect.objectContaining({ entityType: 'instance', entityId: 'i3', action: 'created', detail: { kind: 'created' } }),
		]);
	});

	it.each(['ftp://x', 'http://user:pass@x', 'http://x/?q=1', 'not a url'])('refuses the instance URL %s', async (url) => {
		await expect(fakes.instances.create('orders', { name: 'orders-3', url }, ACTOR)).rejects.toThrow(ConfigValidationError);
	});

	it('refuses a name already used in the service', async () => {
		fakes.repository.findActiveByName.mockResolvedValue(SECOND);

		await expect(fakes.instances.create('orders', { name: 'orders-2', url: 'http://x' }, ACTOR)).rejects.toThrow(ConfigConflictError);
	});

	it('refuses to grow a service past its instance limit', async () => {
		const full = buildServiceRow({
			instances: Array.from({ length: MAX_INSTANCES_PER_SERVICE }, (_, index) => buildInstanceRow({ id: `i${index}` })),
		});

		fakes.services.findOrThrow.mockResolvedValue(full);

		await expect(fakes.instances.create('orders', { name: 'orders-99', url: 'http://x' }, ACTOR)).rejects.toThrow(/maximum/);
	});

	it('turns a lost race at the unique index into a conflict', async () => {
		fakes.repository.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'test' }));

		await expect(fakes.instances.create('orders', { name: 'orders-3', url: 'http://x' }, ACTOR)).rejects.toThrow(ConfigConflictError);
	});

	it('lets any other write failure through', async () => {
		fakes.repository.create.mockRejectedValue(new Error('db down'));

		await expect(fakes.instances.create('orders', { name: 'orders-3', url: 'http://x' }, ACTOR)).rejects.toThrow('db down');
	});

	it('updates an instance, records the change and warns about nothing when others stay enabled', async () => {
		const result = await fakes.instances.update('orders', 'i1', { weight: 3 }, ACTOR);

		expect(result.warning).toBeNull();
		expect(fakes.recorder.record).toHaveBeenCalledWith(
			expect.objectContaining({ detail: { kind: 'fields', changes: [{ field: 'weight', before: 1, after: 3 }] } }),
			ACTOR,
			TRANSACTION,
		);
	});

	it('warns when draining leaves a routed service with no enabled instance', async () => {
		fakes.repository.countEnabled.mockResolvedValue(0);

		const result = await fakes.instances.update('orders', 'i1', { isEnabled: false }, ACTOR);

		expect(result.warning).toBe('service-has-no-enabled-instance');
	});

	it('does not warn for a service no route uses', async () => {
		fakes.services.findOrThrow.mockResolvedValue(buildServiceRow({ _count: { routes: 0 } }));
		fakes.repository.countEnabled.mockResolvedValue(0);

		expect((await fakes.instances.update('orders', 'i1', { isEnabled: false }, ACTOR)).warning).toBeNull();
	});

	it('checks a new name is free and normalizes a new URL', async () => {
		await fakes.instances.update('orders', 'i1', { name: 'orders-9', url: 'http://localhost:48109/' }, ACTOR);

		expect(fakes.repository.findActiveByName).toHaveBeenCalledWith('s1', 'orders-9');
		expect(fakes.repository.update).toHaveBeenCalledWith('i1', { name: 'orders-9', url: 'http://localhost:48109' }, TRANSACTION);
	});

	it('leaves managed instances to the scaling loop', async () => {
		fakes.repository.findActive.mockResolvedValue(buildInstanceRow({ source: 'managed' }));

		await expect(fakes.instances.update('orders', 'i1', { weight: 2 }, ACTOR)).rejects.toThrow(/managed by scaling/);
		await expect(fakes.instances.delete('orders', 'i1', ACTOR)).rejects.toThrow(/managed by scaling/);
	});

	it('answers not found for an instance that is not in the service', async () => {
		fakes.repository.findActive.mockResolvedValue(null);

		await expect(fakes.instances.update('orders', 'ghost', {}, ACTOR)).rejects.toThrow(ConfigNotFoundError);
	});

	it('soft-deletes an instance that is not the last of a routed service', async () => {
		await fakes.instances.delete('orders', 'i1', ACTOR);

		expect(fakes.repository.softDelete).toHaveBeenCalledWith('i1', expect.any(Date), TRANSACTION);
	});

	it('will not delete the last instance of a service routes still use', async () => {
		fakes.services.findOrThrow.mockResolvedValue(buildServiceRow());

		await expect(fakes.instances.delete('orders', 'i1', ACTOR)).rejects.toThrow(/drain it instead/);
	});

	it('lets the last instance go once no route uses the service', async () => {
		fakes.services.findOrThrow.mockResolvedValue(buildServiceRow({ _count: { routes: 0 } }));

		await fakes.instances.delete('orders', 'i1', ACTOR);

		expect(fakes.repository.softDelete).toHaveBeenCalled();
	});
});
