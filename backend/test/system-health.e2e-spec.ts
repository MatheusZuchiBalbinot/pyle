import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../apps/control-plane/src/app.module.js';
import { getTestAdminApiToken } from './support/admin-token.js';

const ADMIN_TOKEN = getTestAdminApiToken();

type ComponentStatusResponse = {
	readonly component: string;
	readonly status: 'up' | 'degraded' | 'down';
	readonly detail: string | null;
};

describe('system health (e2e)', () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		}).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);

		// onModuleInit fires the first checkAll() without awaiting it — give it
		// a moment to actually complete before asserting on its result.
		await pollForNonEmptyStatus(app);
	});

	afterAll(async () => {
		await app.close();
	});

	it('reports the real status of every checked component against the running dev infrastructure', async () => {
		const response = await request(app.getHttpServer()).get('/admin/system/health').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);

		const body = response.body as readonly ComponentStatusResponse[];
		const componentNames = body.map((component) => component.component);

		expect(componentNames).toEqual(expect.arrayContaining(['control_plane_db_primary', 'control_plane_redis', 'gateway']));
		const statusOf = new Map(body.map((component) => [component.component, component.status]));

		expect(statusOf.get('control_plane_db_primary')).toBe('up');
		expect(statusOf.get('control_plane_redis')).toBe('up');
		// Up only while some gateway heartbeats: none runs in CI.
		expect(['up', 'down']).toContain(statusOf.get('gateway'));
	});

	it('records the initial checks in the history', async () => {
		const response = await request(app.getHttpServer()).get('/admin/system/health/history').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);

		const body = response.body as readonly ComponentStatusResponse[];

		expect(body.length).toBeGreaterThan(0);
	});

	// Public, no token: the readiness probe a load balancer calls.
	it('answers the readiness probe without a token, exposing status only', async () => {
		const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

		expect(response.body).toEqual({
			status: 'ready',
			components: { control_plane_db_primary: 'up', control_plane_redis: 'up' },
		});
	});

	it('requires the admin token', async () => {
		await request(app.getHttpServer()).get('/admin/system/health').expect(401);
	});
});

const HEALTH_POLL_INTERVAL_MS = 200;
const HEALTH_POLL_MAX_ATTEMPTS = 25;

async function pollForNonEmptyStatus(app: INestApplication<App>): Promise<void> {
	for (let attempt = 0; attempt < HEALTH_POLL_MAX_ATTEMPTS; attempt++) {
		const response = await request(app.getHttpServer()).get('/admin/system/health').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);
		const body = response.body as readonly ComponentStatusResponse[];

		if (body.length > 0) {
			return;
		}

		await new Promise((resolve) => setTimeout(resolve, HEALTH_POLL_INTERVAL_MS));
	}

	throw new Error('System health status stayed empty within the poll window');
}
