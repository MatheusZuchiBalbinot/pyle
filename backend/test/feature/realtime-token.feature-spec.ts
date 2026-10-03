import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { getTestAdminApiToken } from '../support/admin-token.js';

const ADMIN_TOKEN = getTestAdminApiToken();

type Claims = { sub: string; channels: string[] };

function decodeClaims(token: string): Claims {
	return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()) as Claims;
}

// The token's channels are exactly what Centrifugo subscribes the connection to.
describe('realtime connection tokens (feature)', () => {
	let app: INestApplication<App>;

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);
	});

	afterAll(async () => {
		await app.close();
	});

	it('admin token grants exactly the admin channel', async () => {
		const response = await request(app.getHttpServer()).post('/admin/realtime/token').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(201);

		expect(response.body.channels).toEqual(['admin:events']);
		expect(decodeClaims(response.body.token)).toEqual(expect.objectContaining({ sub: 'admin', channels: ['admin:events'] }));
	});

	// A gateway consumer key is a credential too, just not an admin one.
	it('rejects the admin endpoint with any other bearer token', async () => {
		await request(app.getHttpServer()).post('/admin/realtime/token').set('Authorization', 'Bearer pyle_live_not-an-admin-token').expect(401);
	});
});
