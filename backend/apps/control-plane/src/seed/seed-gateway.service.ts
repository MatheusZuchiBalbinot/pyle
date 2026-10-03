import type { ServiceDto } from '../gateway-config/interface/dto/gateway-config-responses.js';
import type { ConsumerKeyManifest } from './consumer-keys-manifest.js';
import type { CreateServiceBody, SeedAdminApiClient } from './seed-admin-api.client.js';
import {
	SEED_CONSUMERS,
	SEED_ROUTES,
	SEED_SERVICES,
	seededPrefixes,
	type SeedConsumer,
	type SeedInstance,
	type SeedRoute,
	type SeedService,
} from './seed-catalog.js';

type SeedLog = (message: string) => void;

type SeedGatewayOptions = {
	readonly client: SeedAdminApiClient;
	// Where the gateway reaches the demo instances (host.docker.internal
	// when the gateway runs in compose).
	readonly instanceHost: string;
	readonly log: SeedLog;
};

type SeedGatewayResult = {
	readonly createdCount: number;
	readonly skippedCount: number;
	// Keys of the consumers created in this run.
	readonly keys: ConsumerKeyManifest;
};

// Idempotent: existing rows are kept as they are (see keepService for the two exceptions).
export class SeedGatewayService {
	private createdCount = 0;
	private skippedCount = 0;

	constructor(private readonly options: SeedGatewayOptions) {}

	async seed(): Promise<SeedGatewayResult> {
		for (const service of SEED_SERVICES) {
			await this.seedService(service);
		}

		const routeIds = await this.seedRoutes();
		const keys: Record<string, readonly string[]> = {};

		for (const consumer of SEED_CONSUMERS) {
			const created = await this.seedConsumer(consumer, routeIds);

			if (created) {
				keys[consumer.slug] = created;
			}
		}

		return { createdCount: this.createdCount, skippedCount: this.skippedCount, keys };
	}

	private async seedService(service: SeedService): Promise<void> {
		const { client, instanceHost } = this.options;
		const existing = await client.getService(service.slug);

		if (existing) {
			return this.keepService(existing, service);
		}

		const body: CreateServiceBody = {
			slug: service.slug,
			name: service.name,
			description: service.description,
			lbStrategy: service.lbStrategy,
			scalingProfile: service.scalingProfile,
		};

		await client.createService(body);

		for (const instance of service.instances) {
			await client.addInstance(service.slug, { name: instance.name, url: instanceUrl(instanceHost, instance), weight: instance.weight });
		}

		this.create(`service ${service.slug} with ${service.instances.length} instances`);
	}

	// A service seeded before scaling gets its profile, and instances follow
	// SEED_INSTANCE_HOST (the same database may be seeded for a host gateway, then a
	// container one).
	private async keepService(existing: ServiceDto, service: SeedService): Promise<void> {
		const repointedCount = await this.repointInstances(existing, service);
		const hasProfile = existing.scaling.profile !== null;

		if (!hasProfile) {
			await this.options.client.setScalingProfile(service.slug, service.scalingProfile);
			this.options.log(`Gave service ${service.slug} its scaling profile`);
		}

		const isUnchanged = repointedCount === 0 && hasProfile;

		if (isUnchanged) {
			this.skip(`service ${service.slug}`);
		}
	}

	private async repointInstances(existing: ServiceDto, service: SeedService): Promise<number> {
		const { client, instanceHost } = this.options;
		let repointedCount = 0;

		for (const seeded of service.instances) {
			const url = instanceUrl(instanceHost, seeded);
			const current = existing.instances.find((instance) => instance.name === seeded.name && instance.source === 'static');

			if (!current || current.url === url) {
				continue;
			}

			await client.setInstanceUrl(service.slug, current.id, url);
			this.options.log(`Pointed ${seeded.name} at ${url}`);
			repointedCount += 1;
		}

		return repointedCount;
	}

	// Path prefix → route id, for every seeded route.
	private async seedRoutes(): Promise<ReadonlyMap<string, string>> {
		const existing = await this.options.client.listRoutes();
		const idByPrefix = new Map(existing.map((route) => [route.pathPrefix, route.id]));

		for (const route of SEED_ROUTES) {
			if (idByPrefix.has(route.pathPrefix)) {
				this.skip(`route ${route.pathPrefix}`);
				continue;
			}

			const created = await this.createRoute(route);

			idByPrefix.set(route.pathPrefix, created);
		}

		return idByPrefix;
	}

	private async createRoute(route: SeedRoute): Promise<string> {
		const created = await this.options.client.createRoute(route);

		this.create(`route ${route.pathPrefix}`);

		return created.id;
	}

	// The keys, in clear, when the consumer was created now; null otherwise.
	private async seedConsumer(consumer: SeedConsumer, routeIds: ReadonlyMap<string, string>): Promise<readonly string[] | null> {
		const { client } = this.options;
		const existing = await client.getConsumer(consumer.slug);

		if (existing) {
			this.skip(`consumer ${consumer.slug}`);

			return null;
		}

		const allowedRouteIds = seededPrefixes(consumer).flatMap((prefix) => {
			const routeId = routeIds.get(prefix);

			return routeId ? [routeId] : [];
		});
		const created = await client.createConsumer({
			slug: consumer.slug,
			name: consumer.name,
			rateLimitPerMinute: consumer.rateLimitPerMinute,
			routeIds: allowedRouteIds,
		});
		const extraKeys = [];

		for (const label of consumer.keyLabels.slice(1)) {
			extraKeys.push((await client.issueKey(consumer.slug, label)).key);
		}

		if (consumer.isRevoked) {
			for (const apiKey of created.apiKeys) {
				await client.revokeKey(consumer.slug, apiKey.id);
			}
		}

		const revokedNote = consumer.isRevoked ? ', key revoked on purpose' : '';

		this.create(`consumer ${consumer.slug} with ${consumer.keyLabels.length} key(s)${revokedNote}`);

		return [created.key, ...extraKeys];
	}

	private create(what: string): void {
		this.createdCount++;
		this.options.log(`Created ${what}`);
	}

	private skip(what: string): void {
		this.skippedCount++;
		this.options.log(`Kept existing ${what}`);
	}
}

function instanceUrl(host: string, instance: SeedInstance): string {
	return `http://${host}:${instance.port}`;
}
