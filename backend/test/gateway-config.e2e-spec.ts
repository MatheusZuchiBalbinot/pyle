import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';

import { hashApiKey } from '@pyle/shared/contracts/api-key.js';
import { CONFIG_CHANGED_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { AppModule } from '../apps/control-plane/src/app.module.js';
import { getControlPlaneRedisUrl } from '../apps/control-plane/src/config/control-plane-redis.js';
import { ControlPlanePrismaService } from '../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { DemoChaosClient } from '../apps/control-plane/src/gateway-config/infrastructure/demo-chaos.client.js';
import { getTestAdminApiToken } from './support/admin-token.js';

const ADMIN_TOKEN = getTestAdminApiToken();
const RUN = `e2e${Date.now()}`;
const SERVICE_SLUG = `${RUN}-orders`;
const OTHER_SERVICE_SLUG = `${RUN}-users`;
const CONSUMER_SLUG = `${RUN}-app`;
const PREFIX = `/api/${RUN}/orders`;
const CHAOS = { latencyMs: 800, jitterMs: 0, errorRate: 0.2, isDown: false };
const PUBLISH_WAIT_MS = 300;

type Body = Record<string, unknown>;

describe('gateway configuration API (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: ControlPlanePrismaService;
	let subscriber: Redis;
	const published: Body[] = [];
	const applyChaos = vi.fn().mockResolvedValue(undefined);

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
			.overrideProvider(DemoChaosClient)
			.useValue({ apply: applyChaos })
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);
		prisma = app.get(ControlPlanePrismaService, { strict: false });
		subscriber = new Redis(getControlPlaneRedisUrl());
		await subscriber.subscribe(CONFIG_CHANGED_CHANNEL);
		subscriber.on('message', (_channel: string, message: string) => published.push(JSON.parse(message) as Body));
	});

	// Hard delete of everything this run created (soft-deleted rows too).
	afterAll(async () => {
		const services = await prisma.service.findMany({ where: { slug: { startsWith: RUN } } });
		const serviceIds = services.map((service) => service.id);
		const consumers = await prisma.consumer.findMany({ where: { slug: { startsWith: RUN } } });
		const consumerIds = consumers.map((consumer) => consumer.id);

		await prisma.consumerRouteAccess.deleteMany({ where: { consumerId: { in: consumerIds } } });
		await prisma.apiKey.deleteMany({ where: { consumerId: { in: consumerIds } } });
		await prisma.consumer.deleteMany({ where: { id: { in: consumerIds } } });
		await prisma.route.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId: { in: serviceIds } } });
		await prisma.service.deleteMany({ where: { id: { in: serviceIds } } });
		await subscriber.quit();
		await app.close();
	});

	function admin(method: 'get' | 'post' | 'patch' | 'put' | 'delete', path: string): request.Test {
		return request(app.getHttpServer())[method](path).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
	}

	async function waitForPublished(): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, PUBLISH_WAIT_MS));
	}

	it('requires the admin token on every configuration route', async () => {
		for (const path of ['/admin/services', '/admin/routes', '/admin/consumers', '/admin/activity']) {
			await request(app.getHttpServer()).get(path).expect(401);
		}
	});

	it('validates every body at the boundary', async () => {
		await admin('post', '/admin/services').send({ slug: 'Not A Slug', name: 'x' }).expect(400);
		await admin('post', '/admin/services')
			.send({ slug: `${RUN}-x`, name: 'x', timeoutMs: 5 })
			.expect(400);
		await admin('post', '/admin/routes').send({ name: 'x', pathPrefix: '/api/', serviceSlug: 'orders' }).expect(400);
		await admin('post', '/admin/consumers')
			.send({ slug: `${RUN}-y`, name: 'y', routeIds: ['not-a-uuid'] })
			.expect(400);
		await admin('post', '/admin/services')
			.send({ slug: `${RUN}-z`, name: 'z', surprise: true })
			.expect(400);
	});

	it('builds a service, its instances, a route, a consumer with keys and grants, and audits every step', async () => {
		const service = await admin('post', '/admin/services').send({ slug: SERVICE_SLUG, name: 'Pedidos', lbStrategy: 'least_connections' }).expect(201);

		expect(service.body).toMatchObject({ slug: SERVICE_SLUG, lbStrategy: 'least_connections', instances: [], routeCount: 0 });
		await admin('post', '/admin/services').send({ slug: SERVICE_SLUG, name: 'Again' }).expect(409);
		await admin('post', '/admin/services')
			.send({ slug: `${RUN}-bad`, name: 'Bad', healthCheckIntervalMs: 2000, healthCheckTimeoutMs: 2000 })
			.expect(400);

		const first = await admin('post', `/admin/services/${SERVICE_SLUG}/instances`)
			.send({ name: 'orders-1', url: 'http://localhost:48101/' })
			.expect(201);

		expect(first.body).toMatchObject({ name: 'orders-1', url: 'http://localhost:48101', weight: 1, isEnabled: true, source: 'static' });
		await admin('post', `/admin/services/${SERVICE_SLUG}/instances`).send({ name: 'orders-1', url: 'http://localhost:48102' }).expect(409);
		await admin('post', `/admin/services/${SERVICE_SLUG}/instances`).send({ name: 'orders-x', url: 'ftp://nope' }).expect(400);
		await admin('post', `/admin/services/${SERVICE_SLUG}/instances`).send({ name: 'orders-2', url: 'http://localhost:48102', weight: 3 }).expect(201);

		const route = await admin('post', '/admin/routes')
			.send({ name: 'Pedidos', pathPrefix: PREFIX, serviceSlug: SERVICE_SLUG, methods: ['GET', 'POST', 'GET'] })
			.expect(201);

		expect(route.body).toMatchObject({ pathPrefix: PREFIX, methods: ['GET', 'POST'], service: { slug: SERVICE_SLUG }, stripPrefix: true });
		await admin('post', '/admin/routes').send({ name: 'Dup', pathPrefix: PREFIX, serviceSlug: SERVICE_SLUG }).expect(409);
		await admin('post', '/admin/routes')
			.send({ name: 'Ghost', pathPrefix: `${PREFIX}-x`, serviceSlug: `${RUN}-ghost` })
			.expect(404);
		const routeId: string = route.body.id;

		const consumer = await admin('post', '/admin/consumers')
			.send({ slug: CONSUMER_SLUG, name: 'App', rateLimitPerMinute: 120, routeIds: [routeId] })
			.expect(201);
		const key: string = consumer.body.key;

		expect(key).toMatch(/^pyle_live_/);
		expect(consumer.body.allowedRoutes).toEqual([{ id: routeId, name: 'Pedidos', pathPrefix: PREFIX }]);
		expect(JSON.stringify(consumer.body.apiKeys)).not.toContain(key);
		const storedKey = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(key) } });

		expect(storedKey?.keyPrefix).toBe(key.slice(0, 12));

		const second = await admin('post', `/admin/consumers/${CONSUMER_SLUG}/keys`).send({ label: 'ci' }).expect(201);

		expect(second.body).toMatchObject({ label: 'ci', revokedAt: null });
		await admin('delete', `/admin/consumers/${CONSUMER_SLUG}/keys/${second.body.id}`).expect(204);
		await admin('delete', `/admin/consumers/${CONSUMER_SLUG}/keys/${second.body.id}`).expect(204);
		const scoped = await admin('put', `/admin/consumers/${CONSUMER_SLUG}/routes`).send({ routeIds: [] }).expect(200);

		expect(scoped.body.allowedRoutes).toEqual([]);

		const activity = await admin('get', '/admin/activity').query({ entityType: 'consumer', entityId: consumer.body.id }).expect(200);

		expect(activity.body.items.map((item: Body) => item.summary)).toEqual(['routes: all', 'created']);
		expect(activity.body.items[0].actorEmail).toBeNull();

		await waitForPublished();
		const entities = published.map((message) => message.entity);

		expect(entities).toEqual(expect.arrayContaining(['service', 'instance', 'route', 'consumer', 'api_key']));
	});

	it('protects the dependencies between entities', async () => {
		await admin('delete', `/admin/services/${SERVICE_SLUG}`).expect(409);
		const service = await admin('get', `/admin/services/${SERVICE_SLUG}`).expect(200);
		const [first, second] = service.body.instances as Body[];

		const drained = await admin('patch', `/admin/services/${SERVICE_SLUG}/instances/${String(first.id)}`)
			.send({ isEnabled: false })
			.expect(200);

		expect(drained.headers['x-pyle-warning']).toBeUndefined();
		const drainedLast = await admin('patch', `/admin/services/${SERVICE_SLUG}/instances/${String(second.id)}`)
			.send({ isEnabled: false })
			.expect(200);

		expect(drainedLast.headers['x-pyle-warning']).toBe('service-has-no-enabled-instance');

		await admin('delete', `/admin/services/${SERVICE_SLUG}/instances/${String(first.id)}`).expect(204);
		await admin('delete', `/admin/services/${SERVICE_SLUG}/instances/${String(second.id)}`).expect(409);
	});

	it('moves a route to another service and records what changed', async () => {
		await admin('post', '/admin/services').send({ slug: OTHER_SERVICE_SLUG, name: 'Usuários' }).expect(201);
		const [route] = ((await admin('get', '/admin/routes').expect(200)).body as Body[]).filter((candidate) => candidate.pathPrefix === PREFIX);

		const moved = await admin('patch', `/admin/routes/${String(route.id)}`)
			.send({ serviceSlug: OTHER_SERVICE_SLUG, timeoutMs: 2000 })
			.expect(200);

		expect(moved.body).toMatchObject({ service: { slug: OTHER_SERVICE_SLUG }, timeoutMs: 2000 });
		const activity = await admin('get', '/admin/activity').query({ entityType: 'route', entityId: route.id, limit: 1 }).expect(200);
		const [change] = activity.body.items as Body[];

		expect(change.summary).toMatch(/^service .+ -> Usuários, timeoutMs none -> 2000$/);
		expect(change).toMatchObject({
			entityName: route.name,
			detail: {
				kind: 'fields',
				changes: [
					{ field: 'service', after: 'Usuários' },
					{ field: 'timeoutMs', before: null, after: 2000 },
				],
			},
		});
	});

	it('injects chaos only when allowed, through the demo instance', async () => {
		const service = await admin('get', `/admin/services/${SERVICE_SLUG}`).expect(200);
		const instanceId = String((service.body.instances as Body[])[0].id);
		const chaosPath = `/admin/services/${SERVICE_SLUG}/instances/${instanceId}/chaos`;
		const previous = { allowed: process.env.CHAOS_ALLOWED, token: process.env.DEMO_CHAOS_TOKEN };

		try {
			process.env.CHAOS_ALLOWED = 'false';
			await admin('put', chaosPath).send(CHAOS).expect(403);

			process.env.CHAOS_ALLOWED = 'true';
			process.env.DEMO_CHAOS_TOKEN = 'an-e2e-chaos-token-long-enough';
			await admin('put', chaosPath).send(CHAOS).expect(200);
			expect(applyChaos).toHaveBeenCalledWith({ instanceUrl: 'http://localhost:48102', token: 'an-e2e-chaos-token-long-enough', chaos: CHAOS });
			const withChaos = await admin('get', `/admin/services/${SERVICE_SLUG}`).expect(200);

			expect((withChaos.body.instances as Body[])[0].chaos).toEqual(CHAOS);

			await admin('delete', chaosPath).expect(200);
			const cleared = await admin('get', `/admin/services/${SERVICE_SLUG}`).expect(200);

			expect((cleared.body.instances as Body[])[0].chaos).toBeNull();
		} finally {
			process.env.CHAOS_ALLOWED = previous.allowed;
			process.env.DEMO_CHAOS_TOKEN = previous.token;
		}
	});

	it('soft-deletes a consumer and revokes every key it had', async () => {
		const consumer = await admin('get', `/admin/consumers/${CONSUMER_SLUG}`).expect(200);

		await admin('delete', `/admin/consumers/${CONSUMER_SLUG}`).expect(204);

		await admin('get', `/admin/consumers/${CONSUMER_SLUG}`).expect(404);
		const keys = await prisma.apiKey.findMany({ where: { consumerId: consumer.body.id } });

		expect(keys.every((apiKey) => apiKey.revokedAt !== null)).toBe(true);
		const page = await admin('get', '/admin/consumers').query({ limit: 200 }).expect(200);

		expect((page.body.items as Body[]).some((item) => item.slug === CONSUMER_SLUG)).toBe(false);
	});

	it('lets a deleted slug and prefix be reused', async () => {
		const [route] = ((await admin('get', '/admin/routes').expect(200)).body as Body[]).filter((candidate) => candidate.pathPrefix === PREFIX);

		await admin('delete', `/admin/routes/${String(route.id)}`).expect(204);

		await admin('post', '/admin/routes').send({ name: 'Again', pathPrefix: PREFIX, serviceSlug: SERVICE_SLUG }).expect(201);
		await admin('post', '/admin/consumers').send({ slug: CONSUMER_SLUG, name: 'App again' }).expect(201);
	});
});
