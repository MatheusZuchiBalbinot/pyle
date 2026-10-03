import type { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';

// A service with two instances and one route, written straight to the
// database under a per-run slug so suites that only read configuration
// (the AI ones) need not go through the admin API, and removed after.

export type E2eGatewayFixture = {
	readonly serviceId: string;
	readonly serviceSlug: string;
	readonly serviceName: string;
	readonly routeId: string;
	readonly routeName: string;
	readonly pathPrefix: string;
	readonly instanceIds: readonly string[];
	readonly instanceNames: readonly string[];
	readonly remove: () => Promise<void>;
};

export async function createE2eGatewayFixture(prisma: ControlPlanePrismaService, run: string): Promise<E2eGatewayFixture> {
	const serviceSlug = `${run}-orders`;
	const serviceName = `Pedidos ${run}`;
	const instanceNames = [`${run}-orders-1`, `${run}-orders-2`];
	const instances = { create: instanceNames.map((name, index) => ({ name, url: `http://localhost:4810${index + 1}` })) };
	const service = await prisma.service.create({ data: { slug: serviceSlug, name: serviceName, instances }, include: { instances: true } });
	const routeName = `${run}-orders-api`;
	const pathPrefix = `/api/${run}/orders`;
	const route = await prisma.route.create({ data: { name: routeName, pathPrefix, serviceId: service.id } });

	const remove = async (): Promise<void> => {
		await prisma.route.deleteMany({ where: { serviceId: service.id } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId: service.id } });
		await prisma.service.deleteMany({ where: { id: service.id } });
	};

	const instanceIds = instanceNames.map((name) => service.instances.find((instance) => instance.name === name)?.id ?? '');

	return { serviceId: service.id, serviceSlug, serviceName, routeId: route.id, routeName, pathPrefix, instanceIds, instanceNames, remove };
}
