import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { PasswordHasher } from '../../apps/control-plane/src/auth/application/password-hasher.js';
import { AdminUserRepository } from '../../apps/control-plane/src/auth/infrastructure/admin-user.repository.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';

const PASSWORD = 'feature-spec-password-123';
const EMAIL = `feature-auth-${Date.now()}@pyle.local`;
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN ?? '';
const REFRESH_COOKIE_NAME = 'pyle_refresh';

function readRefreshCookie(response: request.Response): string {
	const cookies = response.get('Set-Cookie') ?? [];
	const cookie = cookies.find((candidate) => candidate.startsWith(`${REFRESH_COOKIE_NAME}=`));

	if (!cookie) {
		throw new Error('No refresh cookie in the response');
	}

	return cookie.split(';')[0];
}

describe('admin authentication (feature)', () => {
	let app: INestApplication<App>;
	let userId: string;

	beforeAll(async () => {
		const moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.init();

		const hasher = moduleFixture.get(PasswordHasher, { strict: false });
		const users = moduleFixture.get(AdminUserRepository, { strict: false });
		const created = await users.create({ email: EMAIL, name: 'Feature Spec', passwordHash: await hasher.hash(PASSWORD) });

		userId = created.id;
	});

	afterAll(async () => {
		const prisma = app.get(ControlPlanePrismaService, { strict: false });

		await prisma.adminRefreshToken.deleteMany({ where: { userId } });
		await prisma.adminUser.delete({ where: { id: userId } });
		await app.close();
	});

	it('refuses an admin endpoint without credentials', async () => {
		await request(app.getHttpServer()).get('/admin/settings/platform').expect(401);
	});

	it('logs in, and the access token opens the admin API', async () => {
		const login = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);

		expect(login.body.user).toEqual(expect.objectContaining({ email: EMAIL, name: 'Feature Spec' }));
		const cookie = readRefreshCookie(login);

		expect(cookie).toContain(`${REFRESH_COOKIE_NAME}=`);
		// The refresh token must never be reachable from JavaScript.
		expect((login.get('Set-Cookie') ?? []).join()).toContain('HttpOnly');

		await request(app.getHttpServer()).get('/admin/settings/platform').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
		await request(app.getHttpServer()).get('/admin/auth/me').set('Authorization', `Bearer ${login.body.accessToken}`).expect(200);
	});

	it('rejects a wrong password and an unknown address the same way', async () => {
		const wrongPassword = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: 'nope' }).expect(401);
		const unknownEmail = await request(app.getHttpServer())
			.post('/admin/auth/login')
			.send({ email: `nobody-${Date.now()}@pyle.local`, password: PASSWORD })
			.expect(401);

		expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
	});

	it('rotates the refresh cookie, and refuses the one it replaced', async () => {
		const login = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
		const firstCookie = readRefreshCookie(login);

		const refreshed = await request(app.getHttpServer()).post('/admin/auth/refresh').set('Cookie', firstCookie).expect(200);
		const secondCookie = readRefreshCookie(refreshed);

		expect(secondCookie).not.toBe(firstCookie);

		// Presenting the rotated cookie again is the signature of a stolen
		// session: every token of that user dies, including the new one.
		await request(app.getHttpServer()).post('/admin/auth/refresh').set('Cookie', firstCookie).expect(401);
		await request(app.getHttpServer()).post('/admin/auth/refresh').set('Cookie', secondCookie).expect(401);
	});

	it('logs out: the cookie stops working, the API stops answering', async () => {
		const login = await request(app.getHttpServer()).post('/admin/auth/login').send({ email: EMAIL, password: PASSWORD }).expect(200);
		const cookie = readRefreshCookie(login);

		await request(app.getHttpServer()).post('/admin/auth/logout').set('Cookie', cookie).expect(204);
		await request(app.getHttpServer()).post('/admin/auth/refresh').set('Cookie', cookie).expect(401);
		// Logging out twice is a no-op, not an error.
		await request(app.getHttpServer()).post('/admin/auth/logout').set('Cookie', cookie).expect(204);
	});

	it('still accepts the service token, but not for /me', async () => {
		await request(app.getHttpServer()).get('/admin/settings/platform').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);
		await request(app.getHttpServer()).get('/admin/auth/me').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(401);
	});
});
