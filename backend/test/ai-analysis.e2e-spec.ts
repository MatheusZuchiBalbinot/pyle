import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { vi } from 'vitest';

import { AiModelClient } from '../apps/control-plane/src/ai-analysis/application/ai-model-client.js';
import { AppModule } from '../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { getTestAdminApiToken } from './support/admin-token.js';
import { createE2eGatewayFixture, type E2eGatewayFixture } from './support/e2e-gateway-fixture.js';

// The model is a fake: this proves the endpoint's own plumbing without cost or a real key.
const AI_ANALYSIS_TEST_TIMEOUT_MS = 30_000;
const ADMIN_TOKEN = getTestAdminApiToken();

const UNKNOWN_ANALYSIS_ID = '00000000-0000-4000-8000-000000000000';

const TEST_MODEL_LABEL = 'test-model';
const RUN = `e2eai${Date.now()}`;
const QUIET_ANALYSIS = {
	summary: 'Rota saudável.',
	riskLevel: 'low',
	highlights: ['p95 de 40 ms'],
	recommendations: [],
	suggestedActions: [],
	trend: null,
	trendSummary: null,
};

describe('AI analyses (e2e)', () => {
	let app: INestApplication<App>;
	let fixture: E2eGatewayFixture;
	const runAnalysis = vi.fn();
	const streamReply = vi.fn();

	beforeAll(async () => {
		const moduleFixture: TestingModule = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(AiModelClient)
			.useValue({ runAnalysis, streamReply, getModelId: () => TEST_MODEL_LABEL })
			.compile();

		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.listen(0);
		fixture = await createE2eGatewayFixture(app.get(ControlPlanePrismaService, { strict: false }), RUN);
	});

	// Everything this suite's fake model produced, so the shared dev
	// database doesn't accumulate one batch per run.
	afterAll(async () => {
		const prisma = app.get(ControlPlanePrismaService, { strict: false });
		const producedHere = { model: TEST_MODEL_LABEL };

		await prisma.aiAnalysisMessage.deleteMany({ where: { analysis: producedHere } });
		await prisma.aiAnalysis.deleteMany({ where: producedHere });
		await fixture.remove();
		await app.close();
	});

	it('requires the admin token', async () => {
		await request(app.getHttpServer()).get('/admin/ai/analyses').expect(401);
	});

	it('rejects an unknown scope and a malformed subject', async () => {
		await request(app.getHttpServer()).post('/admin/ai/analyses').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send({ scope: 'galaxy' }).expect(400);
		await request(app.getHttpServer())
			.post('/admin/ai/analyses')
			.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
			.send({ scope: 'route', subjectId: 'not-a-uuid' })
			.expect(400);
	});

	it('refuses a route or service analysis without a subject, or of one that does not exist', async () => {
		const post = (body: object) => request(app.getHttpServer()).post('/admin/ai/analyses').set('Authorization', `Bearer ${ADMIN_TOKEN}`).send(body);

		await post({ scope: 'route' }).expect(400);
		await post({ scope: 'service', subjectId: UNKNOWN_ANALYSIS_ID }).expect(404);
		await post({ scope: 'route', subjectId: UNKNOWN_ANALYSIS_ID }).expect(404);
	});

	it('analyzes a route with its stats fetched up front and stores its name', async () => {
		runAnalysis.mockResolvedValue(QUIET_ANALYSIS);

		const created = await request(app.getHttpServer())
			.post('/admin/ai/analyses')
			.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
			.send({ scope: 'route', subjectId: fixture.routeId, windowMinutes: 60 })
			.expect(201);

		expect(created.body).toEqual(expect.objectContaining({ scope: 'route', subjectId: fixture.routeId, subjectName: fixture.routeName }));
		const runRequest = runAnalysis.mock.calls.at(-1)?.[0];

		expect(runRequest.subject).toEqual(expect.objectContaining({ id: fixture.routeId, name: fixture.routeName }));
		expect(runRequest.initialContext).toContain(fixture.pathPrefix);
	});

	it(
		'generates a platform analysis, lists it, enforces the cooldown and streams a follow-up conversation',
		async () => {
			runAnalysis.mockResolvedValue({
				summary: 'Gateway saudável.',
				riskLevel: 'low',
				highlights: ['p95 de 40 ms'],
				recommendations: [],
				suggestedActions: [],
				trend: null,
				trendSummary: null,
			});
			// A platform analysis from an earlier run of this suite would trip
			// the cooldown; only this suite's own rows are removed.
			const prisma = app.get(ControlPlanePrismaService, { strict: false });

			await prisma.aiAnalysisMessage.deleteMany({ where: { analysis: { model: TEST_MODEL_LABEL } } });
			await prisma.aiAnalysis.deleteMany({ where: { model: TEST_MODEL_LABEL } });
			// The shared dev database may hold platform analyses of its own (the seed, the
			// showcase data): the latest one becomes the previous analysis.
			const latestPlatformAnalysis = await prisma.aiAnalysis.findFirst({ where: { scope: 'platform' }, orderBy: { requestedAt: 'desc' } });
			const expectedPreviousId = latestPlatformAnalysis?.id ?? null;

			const created = await request(app.getHttpServer())
				.post('/admin/ai/analyses')
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.send({ scope: 'platform', windowMinutes: 360 })
				.expect(201);

			expect(created.body).toEqual(
				expect.objectContaining({ scope: 'platform', subjectId: null, subjectName: null, windowMinutes: 360, highlights: ['p95 de 40 ms'] }),
			);
			const analysisRequest = runAnalysis.mock.calls.at(-1)?.[0];

			expect(analysisRequest).toEqual(expect.objectContaining({ scope: 'platform', subject: null }));
			expect(analysisRequest.previousAnalysis?.id ?? null).toBe(expectedPreviousId);
			const analysisId: string = created.body.id;

			const listResponse = await request(app.getHttpServer())
				.get('/admin/ai/analyses')
				.query({ scope: 'platform' })
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.expect(200);

			expect(listResponse.body.items.map((item: { id: string }) => item.id)).toContain(analysisId);
			await request(app.getHttpServer()).get(`/admin/ai/analyses/${analysisId}`).set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);

			// The same scope right away is rejected without calling the model.
			runAnalysis.mockClear();
			await request(app.getHttpServer())
				.post('/admin/ai/analyses')
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.send({ scope: 'platform' })
				.expect(409);
			expect(runAnalysis).not.toHaveBeenCalled();

			streamReply.mockImplementation(async function* () {
				yield { type: 'tool_call', name: 'get_system_health' };
				yield { type: 'text', delta: 'O risco é ' };
				yield { type: 'text', delta: 'baixo.' };
				yield { type: 'done', text: 'O risco é baixo.' };
			});
			const streamed = await request(app.getHttpServer())
				.post(`/admin/ai/analyses/${analysisId}/messages`)
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.send({ question: 'Por que o risco é baixo?' })
				.expect(200)
				.expect('Content-Type', /text\/event-stream/);

			expect(streamed.text).toContain('event: tool_call');
			expect(streamed.text).toContain('event: text');
			expect(streamed.text).toContain('event: message');

			const thread = await request(app.getHttpServer())
				.get(`/admin/ai/analyses/${analysisId}/messages`)
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.expect(200);

			expect(thread.body.map((message: { role: string; content: string }) => [message.role, message.content])).toEqual([
				['user', 'Por que o risco é baixo?'],
				['assistant', 'O risco é baixo.'],
			]);
			// A malformed id is rejected at the boundary; a well-formed one
			// nobody owns reaches the service and is not found.
			await request(app.getHttpServer())
				.post('/admin/ai/analyses/does-not-exist/messages')
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.send({ question: 'oi' })
				.expect(400);
			await request(app.getHttpServer())
				.post(`/admin/ai/analyses/${UNKNOWN_ANALYSIS_ID}/messages`)
				.set('Authorization', `Bearer ${ADMIN_TOKEN}`)
				.send({ question: 'oi' })
				.expect(404);
		},
		AI_ANALYSIS_TEST_TIMEOUT_MS,
	);
});
