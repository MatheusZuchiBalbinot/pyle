import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { getTestAdminApiToken } from './support/admin-token.js';

// Real containers: only runs with PYLE_DOCKER_E2E=true (CI's integration job sets it).
const isEnabled = process.env.PYLE_DOCKER_E2E === 'true';
const ADMIN_TOKEN = getTestAdminApiToken();
const RUN = `e2escale${Date.now()}`;
const SLUG = `${RUN}-orders`;
const POLL_MS = 500;
const SCALE_TIMEOUT_MS = 90_000;

async function waitFor<T>(read: () => Promise<T>, isDone: (value: T) => boolean): Promise<T> {
	const deadline = Date.now() + SCALE_TIMEOUT_MS;

	for (;;) {
		const value = await read();

		if (isDone(value)) {
			return value;
		}

		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting; last value: ${JSON.stringify(value)}`);
		}

		await new Promise((resolve) => setTimeout(resolve, POLL_MS));
	}
}

describe.skipIf(!isEnabled)('managed replicas through Docker (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: ControlPlanePrismaService;

	beforeAll(async () => {
		process.env.SCALING_ALLOWED = 'true';
		const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);
		prisma = app.get(ControlPlanePrismaService, { strict: false });
		await prisma.service.create({ data: { slug: SLUG, name: 'Pedidos e2e', scalingProfile: 'demo_orders' } });
	});

	afterAll(async () => {
		const service = await prisma.service.findFirst({ where: { slug: SLUG } });

		if (service) {
			await prisma.serviceInstance.deleteMany({ where: { serviceId: service.id } });
			await prisma.service.delete({ where: { id: service.id } });
		}

		await app.close();
		process.env.SCALING_ALLOWED = 'false';
	});

	function setReplicas(managedReplicas: number): request.Test {
		return request(app.getHttpServer())
			.put(`/admin/services/${SLUG}/replicas`)
			.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
			.send({ managedReplicas });
	}

	function managedInstances() {
		return prisma.serviceInstance.findMany({ where: { service: { slug: SLUG }, source: 'managed', deletedAt: null } });
	}

	it(
		'creates a healthy replica, then drains and removes it',
		async () => {
			await setReplicas(11).expect(400);
			const response = await setReplicas(1).expect(200);

			expect(response.body.scaling).toEqual({ profile: 'demo_orders', desiredManagedReplicas: 1 });

			const [running] = await waitFor(managedInstances, (instances) => instances.some((instance) => instance.scalingState === 'running'));

			expect(running).toMatchObject({ isEnabled: true, source: 'managed' });
			const health = await fetch(`${running!.url}/health`);

			expect(health.status).toBe(200);

			await setReplicas(0).expect(200);
			await waitFor(managedInstances, (instances) => instances.length === 0);
			await expect(fetch(`${running!.url}/health`)).rejects.toThrow();
		},
		SCALE_TIMEOUT_MS * 2,
	);
});
