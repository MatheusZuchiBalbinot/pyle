import { Test, type TestingModule } from '@nestjs/testing';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { ManagedInstanceRepository } from '../../apps/control-plane/src/scaling/infrastructure/managed-instance.repository.js';

const RUN = `featscale${Date.now()}`;
const PORT = 48_290;

describe('managed instance repository (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let managed: ManagedInstanceRepository;
	let serviceId: string;

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		managed = moduleFixture.get(ManagedInstanceRepository, { strict: false });
		const service = await prisma.service.create({ data: { slug: `${RUN}-orders`, name: 'Pedidos', scalingProfile: 'demo_orders' } });

		serviceId = service.id;
		await prisma.service.create({ data: { slug: `${RUN}-manual`, name: 'Manual' } });
	});

	afterAll(async () => {
		const services = await prisma.service.findMany({ where: { slug: { startsWith: RUN } } });
		const ids = services.map((service) => service.id);

		await prisma.serviceInstance.deleteMany({ where: { serviceId: { in: ids } } });
		await prisma.service.deleteMany({ where: { id: { in: ids } } });
		await moduleFixture.close();
	});

	it('finds scalable services only', async () => {
		await expect(managed.findScalable(serviceId)).resolves.toMatchObject({
			slug: `${RUN}-orders`,
			scalingProfile: 'demo_orders',
			desiredManagedReplicas: 0,
		});
		const scalable = await managed.listScalable();

		expect(scalable.map((service) => service.slug)).toContain(`${RUN}-orders`);
		expect(scalable.map((service) => service.slug)).not.toContain(`${RUN}-manual`);
		const manual = await prisma.service.findFirstOrThrow({ where: { slug: `${RUN}-manual` } });

		await expect(managed.findScalable(manual.id)).resolves.toBeNull();
	});

	it('writes the wanted count and managed instances, and forgets deleted ones', async () => {
		await managed.setDesired(serviceId, 2, prisma);
		const created = await managed.create(
			{
				serviceId,
				name: `${RUN}-m-1`,
				url: `http://localhost:${PORT}`,
				source: 'managed',
				scalingState: 'provisioning',
				hostPort: PORT,
				isEnabled: false,
			},
			prisma,
		);

		await prisma.serviceInstance.create({ data: { serviceId, name: `${RUN}-static`, url: 'http://localhost:48101' } });

		await expect(managed.findScalable(serviceId)).resolves.toMatchObject({ desiredManagedReplicas: 2 });
		expect((await managed.listManaged(serviceId)).map((instance) => instance.id)).toEqual([created.id]);
		expect((await managed.listAllManaged()).map((instance) => instance.id)).toContain(created.id);
		expect(await managed.usedHostPorts()).toContain(PORT);

		await managed.update(created.id, { deletedAt: new Date() }, prisma);

		await expect(managed.listManaged(serviceId)).resolves.toEqual([]);
		expect(await managed.usedHostPorts()).not.toContain(PORT);
	});
});
