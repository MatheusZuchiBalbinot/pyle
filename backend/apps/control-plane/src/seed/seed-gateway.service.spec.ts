import { describe, expect, it, vi } from 'vitest';

import type { SeedAdminApiClient } from './seed-admin-api.client.js';
import { SEED_CONSUMERS, SEED_ROUTES, SEED_SERVICES } from './seed-catalog.js';
import { SeedGatewayService } from './seed-gateway.service.js';

// An in-memory admin API: enough to prove what the seed asks for, and that
// a second run asks for nothing new.
function buildFakeApi() {
	const profiles = new Map<string, string | null>();
	const instances = new Map<string, { id: string; name: string; url: string; source: string }[]>();
	const routes: { id: string; pathPrefix: string }[] = [];
	const consumers = new Map<string, { slug: string; routeIds: readonly string[] }>();
	let keyCount = 0;
	const client = {
		getService: vi.fn(async (slug: string) =>
			profiles.has(slug) ? { slug, scaling: { profile: profiles.get(slug) ?? null }, instances: instances.get(slug) ?? [] } : null,
		),
		createService: vi.fn(async (body: { slug: string; scalingProfile: string }) => {
			profiles.set(body.slug, body.scalingProfile);

			return body;
		}),
		setScalingProfile: vi.fn(async (slug: string, scalingProfile: string) => {
			profiles.set(slug, scalingProfile);

			return { slug };
		}),
		addInstance: vi.fn(async (slug: string, body: { name: string; url: string }) => {
			instances.set(slug, [...(instances.get(slug) ?? []), { id: `id-${body.name}`, name: body.name, url: body.url, source: 'static' }]);

			return {};
		}),
		setInstanceUrl: vi.fn().mockResolvedValue({}),
		listRoutes: vi.fn(async () => [...routes]),
		createRoute: vi.fn(async (body: { pathPrefix: string }) => {
			const route = { id: `route-${routes.length}`, pathPrefix: body.pathPrefix };

			routes.push(route);

			return route;
		}),
		getConsumer: vi.fn(async (slug: string) => consumers.get(slug) ?? null),
		createConsumer: vi.fn(async (body: { slug: string; routeIds: readonly string[] }) => {
			consumers.set(body.slug, body);
			keyCount++;

			return { ...body, key: `pyle_live_${keyCount}`, apiKeys: [{ id: `key-${keyCount}` }] };
		}),
		issueKey: vi.fn(async () => ({ key: `pyle_live_${++keyCount}` })),
		revokeKey: vi.fn().mockResolvedValue(undefined),
	};

	return { client, api: client as unknown as SeedAdminApiClient, profiles };
}

function seed(api: SeedAdminApiClient, instanceHost = 'localhost'): Promise<unknown> {
	return new SeedGatewayService({ client: api, instanceHost, log: vi.fn() }).seed();
}

describe('SeedGatewayService', () => {
	it('creates the whole catalog, with keys, and revokes the demo key', async () => {
		const { client, api } = buildFakeApi();
		const log = vi.fn();

		const result = await new SeedGatewayService({ client: api, instanceHost: 'localhost', log }).seed();

		expect(client.createService).toHaveBeenCalledTimes(SEED_SERVICES.length);
		expect(client.addInstance).toHaveBeenCalledWith('catalog', { name: 'catalog-1', url: 'http://localhost:48121', weight: 3 });
		expect(client.createRoute).toHaveBeenCalledTimes(SEED_ROUTES.length);
		expect(result.createdCount).toBe(SEED_SERVICES.length + SEED_ROUTES.length + SEED_CONSUMERS.length);
		expect(Object.keys(result.keys)).toEqual(SEED_CONSUMERS.map((consumer) => consumer.slug));
		expect(result.keys['mobile-app']).toHaveLength(2);
		expect(client.revokeKey).toHaveBeenCalledTimes(1);
		expect(client.revokeKey).toHaveBeenCalledWith('revoked-demo', expect.any(String));
		const partner = client.createConsumer.mock.calls.find(([body]) => body.slug === 'partner-x')?.[0];

		expect(partner?.routeIds).toHaveLength(1);
	});

	it('creates nothing the second time', async () => {
		const { client, api } = buildFakeApi();

		await new SeedGatewayService({ client: api, instanceHost: 'localhost', log: vi.fn() }).seed();
		vi.clearAllMocks();

		const second = await new SeedGatewayService({ client: api, instanceHost: 'localhost', log: vi.fn() }).seed();

		expect(second).toEqual({ createdCount: 0, skippedCount: SEED_SERVICES.length + SEED_ROUTES.length + SEED_CONSUMERS.length, keys: {} });
		expect(client.createService).not.toHaveBeenCalled();
		expect(client.createRoute).not.toHaveBeenCalled();
		expect(client.createConsumer).not.toHaveBeenCalled();
		expect(client.setScalingProfile).not.toHaveBeenCalled();
	});

	it('gives a service seeded before scaling its profile, once', async () => {
		const { client, api, profiles } = buildFakeApi();

		await new SeedGatewayService({ client: api, instanceHost: 'localhost', log: vi.fn() }).seed();
		profiles.set('orders', null);
		vi.clearAllMocks();

		await new SeedGatewayService({ client: api, instanceHost: 'localhost', log: vi.fn() }).seed();

		expect(client.setScalingProfile).toHaveBeenCalledExactlyOnceWith('orders', 'demo_orders');
		expect(client.createService).not.toHaveBeenCalled();
	});

	it('points seeded instances at a new host, leaving the rest alone', async () => {
		const { client, api } = buildFakeApi();

		await seed(api);
		vi.clearAllMocks();

		await seed(api, 'host.docker.internal');

		expect(client.setInstanceUrl).toHaveBeenCalledWith('orders', 'id-orders-1', 'http://host.docker.internal:48101');
		expect(client.setInstanceUrl).toHaveBeenCalledTimes(SEED_SERVICES.flatMap((service) => service.instances).length);
		expect(client.addInstance).not.toHaveBeenCalled();
	});
});
