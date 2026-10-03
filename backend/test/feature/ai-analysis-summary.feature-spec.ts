import { randomUUID } from 'node:crypto';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AiRiskLevel } from '@prisma/control-plane-client';
import request from 'supertest';
import type { App } from 'supertest/types.js';

import { AiAnalysisRepository, type CreateAiAnalysisInput } from '../../apps/control-plane/src/ai-analysis/infrastructure/ai-analysis.repository.js';
import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { getTestAdminApiToken } from '../support/admin-token.js';

// The console's analysis totals are a distinct count and a filtered count
// over the whole table — database facts, measured as deltas because the
// database is shared with the dev seed.
const TEST_MODEL_LABEL = 'feature-spec';

function buildInput(subjectId: string, riskLevel: AiRiskLevel): CreateAiAnalysisInput {
	return {
		scope: 'route',
		subjectId,
		subjectName: 'Rota de teste',
		windowMinutes: 60,
		summary: 'summary',
		riskLevel,
		highlights: [],
		recommendations: [],
		suggestedActions: [],
		trend: null,
		trendSummary: null,
		previousAnalysisId: null,
		model: TEST_MODEL_LABEL,
	};
}

describe('AI analysis summary (feature)', () => {
	let moduleFixture: TestingModule;
	let app: INestApplication<App>;
	let prisma: ControlPlanePrismaService;
	let repository: AiAnalysisRepository;

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		app = moduleFixture.createNestApplication();
		app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
		await app.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		repository = moduleFixture.get(AiAnalysisRepository, { strict: false });
	});

	afterAll(async () => {
		await prisma.aiAnalysis.deleteMany({ where: { model: TEST_MODEL_LABEL } });
		await app.close();
	});

	it('counts every analysis, each subject once, and the high-risk ones', async () => {
		const before = await repository.summarize();
		const subjectId = randomUUID();

		await repository.create(buildInput(subjectId, 'high'));
		await repository.create(buildInput(subjectId, 'low'));

		const after = await repository.summarize();

		expect(after.totalCount - before.totalCount).toBe(2);
		expect(after.subjectCount - before.subjectCount).toBe(1);
		expect(after.highRiskCount - before.highRiskCount).toBe(1);
	});

	// The summary route sits next to an `/:id` route that validates a
	// UUID: declared in the wrong order, "summary" would be a 400.
	it('serves the summary rather than reading "summary" as an id', async () => {
		const token = getTestAdminApiToken();

		const analyses = await request(app.getHttpServer()).get('/admin/ai/analyses/summary').set('Authorization', `Bearer ${token}`).expect(200);

		expect(Object.keys(analyses.body).sort()).toEqual(['highRiskCount', 'subjectCount', 'totalCount']);
	});
});
