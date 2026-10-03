import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Redis } from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { emptyHistogram, toBucketStart, TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';
import { heartbeatKey, INSTANCE_STATE_HASH, REQUEST_LOG_LIST } from '@pyle/shared/contracts/redis-keys.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import { AppModule } from '../apps/control-plane/src/app.module.js';
import { getControlPlaneRedisUrl } from '../apps/control-plane/src/config/control-plane-redis.js';
import { ControlPlanePrismaService } from '../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { EVALUATION_LAG_MS, GatewayAlertService } from '../apps/control-plane/src/traffic/alerts/application/gateway-alert.service.js';
import { getTestAdminApiToken } from './support/admin-token.js';

const ADMIN_TOKEN = getTestAdminApiToken();
const RUN = `tre2e${Date.now()}`;
const GATEWAY_ID = `gw-${RUN}`;
// A latency bucket well past the 800 ms p95 rule (1000..2500 ms).
const SLOW_BUCKET_INDEX = 8;
const FAST_BUCKET_INDEX = 1;

type Body = Record<string, unknown>;

describe('traffic API (e2e)', () => {
	let app: INestApplication<App>;
	let prisma: ControlPlanePrismaService;
	const redis = new Redis(getControlPlaneRedisUrl());
	let serviceId: string;
	let routeId: string;
	// When the samples were seeded: the alert test evaluates at this instant,
	// so a 10 s window turning over in between cannot empty its newest window.
	let seededAt: number;
	let consumerId: string;
	let fastInstanceId: string;
	let slowInstanceId: string;

	function histogramAt(index: number, count: number): number[] {
		const histogram = emptyHistogram();

		histogram[index] = count;

		return histogram;
	}

	function instanceSample(bucketStartMs: number, instanceId: string, requestCount: number, latencyIndex: number) {
		const counts = {
			requestCount,
			status2xx: requestCount - 1,
			status3xx: 0,
			status4xx: 0,
			status5xx: 1,
			rateLimitedCount: 0,
			gatewayErrorCount: 0,
			retryCount: 1,
		};
		const flushKey = `${GATEWAY_ID}:${bucketStartMs}:${routeId}:${instanceId}`;

		return {
			flushKey,
			gatewayId: GATEWAY_ID,
			bucketStart: new Date(bucketStartMs),
			routeId,
			instanceId,
			...counts,
			latencyBuckets: histogramAt(latencyIndex, requestCount),
			latencySumMs: 0,
		};
	}

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);
		prisma = app.get(ControlPlanePrismaService, { strict: false });

		const service = await prisma.service.create({ data: { slug: `${RUN}-svc`, name: 'Pedidos E2E' } });

		serviceId = service.id;
		const fast = await prisma.serviceInstance.create({ data: { serviceId, name: 'fast', url: 'http://127.0.0.1:1' } });
		const slow = await prisma.serviceInstance.create({ data: { serviceId, name: 'slow', url: 'http://127.0.0.1:2' } });

		fastInstanceId = fast.id;
		slowInstanceId = slow.id;
		const route = await prisma.route.create({ data: { name: `${RUN} pedidos`, pathPrefix: `/${RUN}/orders`, serviceId } });

		routeId = route.id;
		const consumer = await prisma.consumer.create({ data: { slug: `${RUN}-app`, name: 'App E2E' } });

		consumerId = consumer.id;

		// The last three closed windows the evaluator will judge, plus older
		// traffic: 30 fast requests on one instance, 10 slow on the other.
		seededAt = Date.now();
		const newestStart = toBucketStart(seededAt - TRAFFIC_BUCKET_MS - EVALUATION_LAG_MS);
		const starts = [0, 1, 2, 30].map((windowsBack) => newestStart - windowsBack * TRAFFIC_BUCKET_MS);
		const samples = starts.flatMap((start) => [
			instanceSample(start, fastInstanceId, 30, FAST_BUCKET_INDEX),
			instanceSample(start, slowInstanceId, 10, SLOW_BUCKET_INDEX),
		]);

		await prisma.routeInstanceSample.createMany({ data: samples });
		const consumerSamples = starts.map((start) => ({
			flushKey: `${GATEWAY_ID}:${start}:${routeId}:${consumerId}`,
			gatewayId: GATEWAY_ID,
			bucketStart: new Date(start),
			routeId,
			consumerId,
			requestCount: 40,
			status4xx: 2,
			status5xx: 2,
			rateLimitedCount: 2,
			latencyBuckets: histogramAt(FAST_BUCKET_INDEX, 40),
			latencySumMs: 0,
		}));

		await prisma.routeConsumerSample.createMany({ data: consumerSamples });

		const now = new Date().toISOString();
		const heartbeat = { gatewayId: GATEWAY_ID, startedAt: now, configVersion: 1, isRateLimitDegraded: false, updatedAt: now };

		await redis.set(heartbeatKey(GATEWAY_ID), JSON.stringify(heartbeat), 'PX', 60_000);
		const entry: RequestLogEntry = {
			requestId: `${RUN}-1`,
			at: now,
			method: 'GET',
			path: `/${RUN}/orders/1`,
			routeId,
			routeName: route.name,
			consumerId,
			consumerSlug: consumer.slug,
			instanceId: slowInstanceId,
			instanceName: 'slow',
			status: 503,
			durationMs: 1500,
			attempts: 2,
			gatewayError: null,
		};

		await redis.lpush(REQUEST_LOG_LIST, JSON.stringify({ ...entry, requestId: `${RUN}-2`, status: 200 }), JSON.stringify(entry));
	});

	afterAll(async () => {
		await prisma.gatewayAlert.deleteMany({ where: { subjectId: { in: [routeId, fastInstanceId, slowInstanceId] } } });
		await prisma.routeInstanceSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.routeConsumerSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.route.deleteMany({ where: { serviceId } });
		await prisma.serviceInstance.deleteMany({ where: { serviceId } });
		await prisma.service.deleteMany({ where: { id: serviceId } });
		await prisma.consumer.deleteMany({ where: { id: consumerId } });
		await redis.del(heartbeatKey(GATEWAY_ID));
		await redis.hdel(INSTANCE_STATE_HASH, slowInstanceId);
		await redis.quit();
		await app.close();
	});

	function admin(path: string): request.Test {
		return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${ADMIN_TOKEN}`);
	}

	it('requires the admin token', async () => {
		for (const path of ['/admin/traffic/overview', '/admin/gateway/status', '/admin/alerts/open', '/admin/alert-rules', '/admin/overview']) {
			await request(app.getHttpServer()).get(path).expect(401);
		}
	});

	it('serves the route traffic per instance, with percentiles from summed histograms', async () => {
		const response = await admin(`/admin/traffic/routes/${routeId}?window=15m`).expect(200);
		const body = response.body as Body & { readonly instances: readonly Body[]; readonly series: readonly Body[] };

		expect(body.window).toMatchObject({ stepSeconds: 10 });
		expect(body.totals).toMatchObject({ requestCount: 160, retryCount: 8, errorRate: 8 / 160 });
		expect(body.statusBreakdown).toMatchObject({ status2xx: 152, status5xx: 8 });
		expect((body.totals as Body).p95Ms).toBeGreaterThan(1000);
		// 15 min of whole 10 s steps, plus the step in progress.
		expect(body.series).toHaveLength(91);
		expect(body.instances.map((instance) => [instance.name, instance.share])).toEqual([
			['fast', 0.75],
			['slow', 0.25],
		]);
	});

	it('serves the service and the consumer, and the overview with this route in it', async () => {
		const service = (await admin(`/admin/traffic/services/${RUN}-svc?window=1h`).expect(200)).body as Body & { readonly instances: readonly Body[] };
		const consumer = (await admin(`/admin/traffic/consumers/${RUN}-app`).expect(200)).body as Body & { readonly routes: readonly Body[] };
		const overview = (await admin('/admin/traffic/overview?window=1h').expect(200)).body as Body & { readonly routes: readonly Body[] };

		expect(service.totals).toMatchObject({ requestCount: 160 });
		expect(service.instances).toHaveLength(2);
		expect(consumer.totals).toMatchObject({ requestCount: 160, rateLimitedCount: 8, clientErrorRate: 0, retryCount: 0 });
		expect(consumer.routes).toEqual([{ routeId, name: `${RUN} pedidos`, requestCount: 160, rateLimitedCount: 8 }]);
		expect(overview.routes).toContainEqual(expect.objectContaining({ routeId, pathPrefix: `/${RUN}/orders` }));
	});

	it('validates windows and missing subjects', async () => {
		const from = new Date(Date.now() - 3_600_000).toISOString();
		const to = new Date().toISOString();

		await admin(`/admin/traffic/overview?from=${from}&to=${to}`).expect(200);
		await admin(`/admin/traffic/overview?from=${to}&to=${from}`).expect(400);
		await admin(`/admin/traffic/overview?from=${from}`).expect(400);
		await admin(`/admin/traffic/overview?window=1h&from=${from}&to=${to}`).expect(400);
		await admin('/admin/traffic/overview?window=2d').expect(400);
		await admin('/admin/traffic/routes/00000000-0000-4000-8000-000000000000').expect(404);
		await admin('/admin/traffic/services/nope-nothing').expect(404);
	});

	it('pages through the request log with filters', async () => {
		const errors = (await admin(`/admin/traffic/requests?routeId=${routeId}&statusClass=5xx`).expect(200)).body as {
			readonly items: readonly RequestLogEntry[];
		};
		const firstPage = (await admin(`/admin/traffic/requests?routeId=${routeId}&limit=1`).expect(200)).body as {
			readonly items: readonly RequestLogEntry[];
			readonly nextCursor: string;
		};
		const secondPage = (await admin(`/admin/traffic/requests?routeId=${routeId}&limit=1&cursor=${firstPage.nextCursor}`).expect(200)).body as {
			readonly items: readonly RequestLogEntry[];
		};

		expect(errors.items.map((entry) => entry.requestId)).toEqual([`${RUN}-1`]);
		expect([...firstPage.items, ...secondPage.items].map((entry) => entry.requestId)).toEqual([`${RUN}-1`, `${RUN}-2`]);
		await admin('/admin/traffic/requests?cursor=-4').expect(400);
	});

	it('reports the gateways from their heartbeats', async () => {
		const status = (await admin('/admin/gateway/status').expect(200)).body as { readonly gateways: readonly Body[]; readonly configVersion: number };

		expect(status.gateways).toContainEqual(expect.objectContaining({ gatewayId: GATEWAY_ID, isAlive: true }));
		expect(status.configVersion).toBeGreaterThan(0);
	});

	it('opens alerts for a slow route and an unhealthy instance, once, and resolves them', async () => {
		const alerts = app.get(GatewayAlertService, { strict: false });
		const liveState = {
			instanceId: slowInstanceId,
			gatewayId: GATEWAY_ID,
			health: 'unhealthy',
			circuit: 'closed',
			inFlight: 0,
			consecutiveFailures: 3,
			lastCheckAt: null,
			lastCheckLatencyMs: null,
			updatedAt: new Date().toISOString(),
		};

		await redis.hset(INSTANCE_STATE_HASH, slowInstanceId, JSON.stringify(liveState));

		await alerts.evaluate(seededAt);
		await alerts.evaluate(seededAt);
		const open = (await admin('/admin/alerts/open').expect(200)).body as readonly Body[];
		const ours = open.filter((alert) => alert.subjectId === routeId || alert.subjectId === slowInstanceId);

		expect(ours.map((alert) => [alert.kind, alert.subjectName, alert.severity])).toEqual(
			expect.arrayContaining([
				['route_p95_latency', `${RUN} pedidos`, 'critical'],
				['instance_unhealthy', `${RUN}-svc/slow`, 'critical'],
			]),
		);
		expect(ours).toHaveLength(2);

		await redis.hset(INSTANCE_STATE_HASH, slowInstanceId, JSON.stringify({ ...liveState, health: 'healthy' }));
		await alerts.evaluate(seededAt);
		const history = (await admin('/admin/alerts?limit=200').expect(200)).body as { readonly items: readonly Body[] };
		const instanceAlert = history.items.find((alert) => alert.subjectId === slowInstanceId);

		expect(instanceAlert?.resolvedAt).not.toBeNull();
	});

	it('lists and changes alert rules, audited, rejecting thresholds outside the kind', async () => {
		const rules = (await admin('/admin/alert-rules').expect(200)).body as readonly Body[];
		const { kind: _kind, ...original } = rules.find((rule) => rule.kind === 'route_error_rate') as Body;
		const put = (kind: string, body: Body): request.Test =>
			request(app.getHttpServer()).put(`/admin/alert-rules/${kind}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`).send(body);

		expect(rules.map((rule) => rule.kind)).toEqual(['route_p95_latency', 'route_error_rate', 'instance_unhealthy', 'circuit_open']);
		await put('route_error_rate', { isEnabled: true, threshold: 7, sustainedWindows: 2 }).expect(200, {
			kind: 'route_error_rate',
			isEnabled: true,
			threshold: 7,
			sustainedWindows: 2,
		});
		await put('route_error_rate', { isEnabled: true, threshold: 500, sustainedWindows: 2 }).expect(400);
		await put('circuit_open', { isEnabled: true, threshold: 5, sustainedWindows: 1 }).expect(400);
		await put('nonsense', { isEnabled: true, threshold: null, sustainedWindows: 1 }).expect(400);
		await put('route_error_rate', original).expect(200);

		const activity = (await admin('/admin/activity?entityType=alert_rule&limit=2').expect(200)).body as { readonly items: readonly Body[] };

		expect(activity.items[0]).toMatchObject({ entityType: 'alert_rule', summary: expect.stringContaining('route_error_rate') });
	});

	it('composes the overview page in one call', async () => {
		const overview = (await admin('/admin/overview').expect(200)).body as Body & { readonly services: readonly Body[]; readonly gateway: Body };

		expect(Object.keys(overview).sort()).toEqual(['gateway', 'generatedAt', 'openAlerts', 'recentChanges', 'services', 'systemHealth', 'traffic']);
		expect(overview.services).toContainEqual(expect.objectContaining({ slug: `${RUN}-svc` }));
		expect((overview.traffic as Body).window).toMatchObject({ stepSeconds: 60 });
	});
});
