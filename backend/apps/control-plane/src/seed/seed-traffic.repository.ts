import { Injectable } from '@nestjs/common';

import { ControlPlanePrismaService } from '../control-plane/prisma/control-plane-prisma.service.js';
import { SEED_CONSUMERS, SEED_ROUTES, SEED_SERVICES } from './seed-catalog.js';
import { SEED_GATEWAY_ID, type SynthesisCatalog, type SyntheticHistory } from './synthesize-traffic.js';

// Rows per INSERT: big enough to be fast, small enough for Postgres'
// parameter limit.
const SEED_WRITE_BATCH_SIZE = 5000;
// The dev admin signs the story's configuration change.
const STORY_ACTOR_EMAIL = 'seed@pyle.local';

// History goes straight to the database: it is traffic data, not configuration.
@Injectable()
export class SeedTrafficRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	async hasHistory(): Promise<boolean> {
		const sample = await this.prisma.routeInstanceSample.findFirst({ where: { gatewayId: SEED_GATEWAY_ID }, select: { id: true } });

		return sample !== null;
	}

	async loadCatalog(): Promise<SynthesisCatalog> {
		const prefixes = SEED_ROUTES.map((route) => route.pathPrefix);
		const [routes, services, consumers] = await Promise.all([
			this.prisma.route.findMany({ where: { pathPrefix: { in: prefixes }, deletedAt: null }, include: { service: true } }),
			this.prisma.service.findMany({
				where: { slug: { in: SEED_SERVICES.map((service) => service.slug) }, deletedAt: null },
				include: { instances: { where: { deletedAt: null } } },
			}),
			this.prisma.consumer.findMany({ where: { slug: { in: SEED_CONSUMERS.map((consumer) => consumer.slug) }, deletedAt: null } }),
		]);

		return {
			routes: routes.map((route) => ({ routeId: route.id, pathPrefix: route.pathPrefix, serviceSlug: route.service.slug })),
			instancesByService: new Map(
				services.map((service) => [
					service.slug,
					service.instances.map((instance) => ({ instanceId: instance.id, name: instance.name, weight: instance.weight })),
				]),
			),
			consumerIdBySlug: new Map(consumers.map((consumer) => [consumer.slug, consumer.id])),
		};
	}

	// Samples go in batches; skipDuplicates on the flush key makes a rerun
	// harmless.
	async writeHistory(history: SyntheticHistory, onProgress: (written: number, total: number) => void): Promise<void> {
		const total = history.instanceSamples.length + history.consumerSamples.length;
		let written = 0;

		for (const batch of chunks(history.instanceSamples, SEED_WRITE_BATCH_SIZE)) {
			await this.prisma.routeInstanceSample.createMany({ data: [...batch], skipDuplicates: true });
			written += batch.length;
			onProgress(written, total);
		}

		for (const batch of chunks(history.consumerSamples, SEED_WRITE_BATCH_SIZE)) {
			await this.prisma.routeConsumerSample.createMany({ data: [...batch], skipDuplicates: true });
			written += batch.length;
			onProgress(written, total);
		}

		await this.prisma.instanceStateEvent.createMany({ data: [...history.stateEvents] });
		await this.prisma.gatewayAlert.createMany({ data: [...history.alerts] });
		const changes = history.configChanges.map((change) => ({ ...change, actorEmail: STORY_ACTOR_EMAIL }));

		await this.prisma.configChangeEvent.createMany({ data: changes });
	}

	// Hard delete on purpose: seed:clean exists to get back to an empty gateway.
	async clean(): Promise<void> {
		const services = await this.prisma.service.findMany({
			where: { slug: { in: SEED_SERVICES.map((service) => service.slug) } },
			include: { instances: true },
		});
		const serviceIds = services.map((service) => service.id);
		const instanceIds = services.flatMap((service) => service.instances.map((instance) => instance.id));
		const routes = await this.prisma.route.findMany({
			where: { OR: [{ serviceId: { in: serviceIds } }, { pathPrefix: { in: SEED_ROUTES.map((route) => route.pathPrefix) } }] },
		});
		const routeIds = routes.map((route) => route.id);
		const consumers = await this.prisma.consumer.findMany({ where: { slug: { in: SEED_CONSUMERS.map((consumer) => consumer.slug) } } });
		const consumerIds = consumers.map((consumer) => consumer.id);
		const entityIds = [...serviceIds, ...instanceIds, ...routeIds, ...consumerIds];

		await this.prisma.$transaction([
			// The synthetic history, and what live gateways recorded for the demo's
			// entities: left behind, it reads as traffic from "a removed consumer".
			this.prisma.routeInstanceSample.deleteMany({
				where: { OR: [{ gatewayId: SEED_GATEWAY_ID }, { routeId: { in: routeIds } }, { instanceId: { in: instanceIds } }] },
			}),
			this.prisma.routeConsumerSample.deleteMany({
				where: { OR: [{ gatewayId: SEED_GATEWAY_ID }, { routeId: { in: routeIds } }, { consumerId: { in: consumerIds } }] },
			}),
			this.prisma.instanceStateEvent.deleteMany({ where: { OR: [{ gatewayId: SEED_GATEWAY_ID }, { instanceId: { in: instanceIds } }] } }),
			this.prisma.gatewayAlert.deleteMany({ where: { subjectId: { in: entityIds } } }),
			this.prisma.configChangeEvent.deleteMany({ where: { entityId: { in: entityIds } } }),
			this.prisma.consumerRouteAccess.deleteMany({ where: { OR: [{ consumerId: { in: consumerIds } }, { routeId: { in: routeIds } }] } }),
			this.prisma.apiKey.deleteMany({ where: { consumerId: { in: consumerIds } } }),
			this.prisma.consumer.deleteMany({ where: { id: { in: consumerIds } } }),
			this.prisma.route.deleteMany({ where: { id: { in: routeIds } } }),
			this.prisma.serviceInstance.deleteMany({ where: { serviceId: { in: serviceIds } } }),
			this.prisma.service.deleteMany({ where: { id: { in: serviceIds } } }),
		]);
	}
}

function chunks<T>(rows: readonly T[], size: number): readonly (readonly T[])[] {
	const batches: T[][] = [];

	for (let start = 0; start < rows.length; start += size) {
		batches.push(rows.slice(start, start + size));
	}

	return batches;
}
