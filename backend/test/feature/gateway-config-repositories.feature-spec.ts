import { Test, type TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/control-plane-client';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { toPageRequest } from '../../apps/control-plane/src/common/pagination.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { ApiKeyRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/api-key.repository.js';
import { ConfigChangeEventRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/config-change-event.repository.js';
import { ConsumerRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/consumer.repository.js';
import { InstanceRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/instance.repository.js';
import { RouteRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/route.repository.js';
import { ServiceRepository } from '../../apps/control-plane/src/gateway-config/infrastructure/service.repository.js';

// The partial unique indexes and the soft-delete filters only exist in the
// real database (created by the migrations): this is where they are proven.
const RUN = `feat${Date.now()}`;
const LONG_AGO = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);

function isUniqueViolation(error: unknown): boolean {
	return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

describe('gateway configuration repositories (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let services: ServiceRepository;
	let instances: InstanceRepository;
	let routes: RouteRepository;
	let consumers: ConsumerRepository;
	let apiKeys: ApiKeyRepository;
	let events: ConfigChangeEventRepository;

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		services = moduleFixture.get(ServiceRepository, { strict: false });
		instances = moduleFixture.get(InstanceRepository, { strict: false });
		routes = moduleFixture.get(RouteRepository, { strict: false });
		consumers = moduleFixture.get(ConsumerRepository, { strict: false });
		apiKeys = moduleFixture.get(ApiKeyRepository, { strict: false });
		events = moduleFixture.get(ConfigChangeEventRepository, { strict: false });
	});

	afterAll(async () => {
		const serviceIds = (await prisma.service.findMany({ where: { slug: { startsWith: RUN } } })).map((service) => service.id);
		const consumerIds = (await prisma.consumer.findMany({ where: { slug: { startsWith: RUN } } })).map((consumer) => consumer.id);

		await prisma.consumerRouteAccess.deleteMany({ where: { consumerId: { in: consumerIds } } });
		await prisma.apiKey.deleteMany({ where: { consumerId: { in: consumerIds } } });
		await prisma.consumer.deleteMany({ where: { id: { in: consumerIds } } });
		await prisma.route.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
		await prisma.configChangeEvent.deleteMany({ where: { summary: { startsWith: RUN } } });
		await moduleFixture.close();
	});

	it('keeps service slugs unique among active services only', async () => {
		const first = await services.create({ slug: `${RUN}-a`, name: 'A' });

		await expect(services.create({ slug: `${RUN}-a`, name: 'A again' })).rejects.toSatisfy(isUniqueViolation);

		await services.softDeleteWithInstances(first.id, prisma, new Date());
		expect(await services.findActiveBySlug(`${RUN}-a`)).toBeNull();
		expect(await services.findByIdIncludingDeleted(first.id)).not.toBeNull();

		await expect(services.create({ slug: `${RUN}-a`, name: 'A reborn' })).resolves.toBeDefined();
	});

	it('keeps instance names unique per service and counts only active, enabled ones', async () => {
		const service = await services.create({ slug: `${RUN}-b`, name: 'B' });
		const one = await instances.create({ serviceId: service.id, name: 'b-1', url: 'http://x' });

		await instances.create({ serviceId: service.id, name: 'b-2', url: 'http://y', isEnabled: false });
		await expect(instances.create({ serviceId: service.id, name: 'b-1', url: 'http://z' })).rejects.toSatisfy(isUniqueViolation);

		expect(await instances.countActive(service.id)).toBe(2);
		expect(await instances.countEnabled(service.id)).toBe(1);
		expect((await instances.findActiveByName(service.id, 'b-2'))?.isEnabled).toBe(false);

		await instances.softDelete(one.id, new Date());
		expect(await instances.findActive(service.id, one.id)).toBeNull();
		expect(await instances.findByIdIncludingDeleted(one.id)).not.toBeNull();
		expect((await services.findActiveBySlug(`${RUN}-b`))?.instances.map((instance) => instance.name)).toEqual(['b-2']);
	});

	it('keeps prefixes unique among active routes and drops the grants of a deleted route', async () => {
		const service = await services.create({ slug: `${RUN}-c`, name: 'C' });
		const route = await routes.create({ name: 'C', pathPrefix: `/${RUN}/c`, serviceId: service.id });

		await expect(routes.create({ name: 'C2', pathPrefix: `/${RUN}/c`, serviceId: service.id })).rejects.toSatisfy(isUniqueViolation);
		const consumer = await consumers.create({ slug: `${RUN}-c`, name: 'C' });

		await consumers.replaceRouteAccess(consumer.id, [route.id], prisma);

		expect((await services.findActiveBySlug(`${RUN}-c`))?._count.routes).toBe(1);
		expect(await routes.countActiveIn([route.id, 'missing'])).toBe(1);

		await prisma.transaction((transaction) => routes.softDelete(route.id, new Date(), transaction));

		expect(await routes.findActiveById(route.id)).toBeNull();
		expect(await routes.findActiveByPrefix(`/${RUN}/c`)).toBeNull();
		expect(await routes.findByIdIncludingDeleted(route.id)).not.toBeNull();
		expect((await consumers.findActiveBySlug(`${RUN}-c`))?.routeAccess).toEqual([]);
		await expect(routes.create({ name: 'C again', pathPrefix: `/${RUN}/c`, serviceId: service.id })).resolves.toBeDefined();
	});

	it('pages consumers newest first and hides deleted ones', async () => {
		const older = await consumers.create({ slug: `${RUN}-d1`, name: 'D1' });

		await prisma.consumer.update({ where: { id: older.id }, data: { createdAt: new Date(Date.now() - 1000) } });
		await consumers.create({ slug: `${RUN}-d2`, name: 'D2' });
		const gone = await consumers.create({ slug: `${RUN}-d3`, name: 'D3' });

		await consumers.softDelete(gone.id, new Date(), prisma);

		const first = await consumers.listPage(toPageRequest({ limit: 1 }));
		const own = (await consumers.listPage(toPageRequest({ limit: 200 }))).items.filter((item) => item.slug.startsWith(`${RUN}-d`));

		expect(first.items).toHaveLength(1);
		expect(first.nextCursor).not.toBeNull();
		expect(own.map((item) => item.slug)).toEqual([`${RUN}-d2`, `${RUN}-d1`]);
		expect(await consumers.findByIdIncludingDeleted(gone.id)).not.toBeNull();
	});

	it('revokes keys, lists only active ones, and purges a long-deleted consumer entirely', async () => {
		const consumer = await consumers.create({ slug: `${RUN}-e`, name: 'E' });
		const key = await apiKeys.create({ consumerId: consumer.id, keyHash: `${RUN}-hash`, keyPrefix: 'pyle_live_Ee' });

		expect(await apiKeys.countActive(consumer.id)).toBe(1);
		expect((await apiKeys.find(consumer.id, key.id))?.keyPrefix).toBe('pyle_live_Ee');

		await apiKeys.revoke([key.id], new Date());
		expect(await apiKeys.listActive(consumer.id)).toEqual([]);

		await consumers.softDelete(consumer.id, LONG_AGO, prisma);
		const expired = await consumers.listDeletedBefore(new Date());

		expect(expired.map((row) => row.id)).toContain(consumer.id);

		await consumers.purge(consumer.id);
		expect(await consumers.findByIdIncludingDeleted(consumer.id)).toBeNull();
		expect(await apiKeys.find(consumer.id, key.id)).toBeNull();
	});

	it('restores only the revocation it was asked to undo', async () => {
		const consumer = await consumers.create({ slug: `${RUN}-r`, name: 'R' });
		const key = await apiKeys.create({ consumerId: consumer.id, keyHash: `${RUN}-hash-r`, keyPrefix: 'pyle_live_Rr' });
		const revokedAt = new Date();
		const otherRevocation = new Date(revokedAt.getTime() - 1000);

		await apiKeys.revoke([key.id], revokedAt);

		expect(await apiKeys.restore(key.id, otherRevocation)).toBe(false);
		expect(await apiKeys.countActive(consumer.id)).toBe(0);
		expect(await apiKeys.restore(key.id, revokedAt)).toBe(true);
		expect(await apiKeys.countActive(consumer.id)).toBe(1);
		expect(await apiKeys.restore(key.id, revokedAt)).toBe(false);
	});

	it('pages the audit trail by entity, newest first', async () => {
		await events.create({ entityType: 'route', entityId: `${RUN}-r`, action: 'created', summary: `${RUN} created` });
		await events.create({ entityType: 'route', entityId: `${RUN}-r`, action: 'updated', summary: `${RUN} updated` });

		const page = await events.listPage({ entityType: 'route', entityId: `${RUN}-r` }, toPageRequest({ limit: 1 }));
		const next = await events.listPage(
			{ entityType: 'route', entityId: `${RUN}-r` },
			toPageRequest({ limit: 1, cursor: page.nextCursor ?? undefined }),
		);
		const recent = await events.listSince(new Date(Date.now() - 60_000), 50);

		expect(page.items.map((item) => item.action)).toEqual(['updated']);
		expect(next.items.map((item) => item.action)).toEqual(['created']);
		expect(recent.some((event) => event.entityId === `${RUN}-r`)).toBe(true);
	});
});
