import { Injectable } from '@nestjs/common';
import type { AiAnalysis, AiAnalysisMessage, AiAnalysisScope, AiMessageRole, AiRiskLevel, AiTrend, Prisma } from '@prisma/control-plane-client';

import { toPage, type Page, type PageRequest } from '../../common/pagination.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { SuggestedAction } from '../domain/parse-generated-analysis.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_MESSAGES = 200;

export type CreateAiAnalysisInput = {
	readonly scope: AiAnalysisScope;
	readonly subjectId: string | null;
	readonly subjectName: string | null;
	readonly windowMinutes: number | null;
	readonly summary: string;
	readonly riskLevel: AiRiskLevel;
	readonly highlights: readonly string[];
	readonly recommendations: readonly string[];
	readonly suggestedActions: readonly SuggestedAction[];
	readonly trend: AiTrend | null;
	readonly trendSummary: string | null;
	readonly previousAnalysisId: string | null;
	readonly model: string;
};

export type AiAnalysisSummary = {
	readonly totalCount: number;
	// Distinct subjects: each route or service, plus the platform counted once.
	readonly subjectCount: number;
	readonly highRiskCount: number;
};

export type ListAnalysesFilter = {
	readonly scope?: AiAnalysisScope;
	// A string filters one subject, null the platform rows, undefined nothing.
	readonly subjectId?: string | null;
};

const LIST_ORDER = [{ requestedAt: 'desc' }, { id: 'desc' }] as const;

// Analyses are never updated or deleted.
@Injectable()
export class AiAnalysisRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	create(input: CreateAiAnalysisInput): Promise<AiAnalysis> {
		const data: Prisma.AiAnalysisUncheckedCreateInput = {
			...input,
			highlights: [...input.highlights],
			recommendations: [...input.recommendations],
			suggestedActions: input.suggestedActions as unknown as Prisma.InputJsonValue,
		};

		return this.prisma.aiAnalysis.create({ data });
	}

	findLatest(scope: AiAnalysisScope, subjectId: string | null): Promise<AiAnalysis | null> {
		return this.prisma.aiAnalysis.findFirst({ where: { scope, subjectId }, orderBy: { requestedAt: 'desc' } });
	}

	findById(id: string): Promise<AiAnalysis | null> {
		return this.prisma.aiAnalysis.findUnique({ where: { id } });
	}

	// Analyses of a deleted route or service stay: they record what the operator was told.
	listRecent(filter: ListAnalysesFilter, limit: number = DEFAULT_LIST_LIMIT): Promise<readonly AiAnalysis[]> {
		return this.prisma.aiAnalysis.findMany({ where: this.buildWhere(filter), orderBy: [...LIST_ORDER], take: limit });
	}

	// Keyset on (requestedAt, id).
	async listPage(filter: ListAnalysesFilter, page: PageRequest): Promise<Page<AiAnalysis>> {
		const rows = await this.prisma.aiAnalysis.findMany({
			where: { ...this.buildWhere(filter), ...toCursorFilter(page) },
			orderBy: [...LIST_ORDER],
			take: page.limit + 1,
		});

		return toPage(rows, page.limit, (row) => ({ orderedAt: row.requestedAt, id: row.id }));
	}

	private buildWhere(filter: ListAnalysesFilter): Prisma.AiAnalysisWhereInput {
		return { scope: filter.scope, subjectId: filter.subjectId };
	}

	async summarize(): Promise<AiAnalysisSummary> {
		const where = this.buildWhere({});
		const [totalCount, subjectGroups, highRiskCount] = await Promise.all([
			this.prisma.aiAnalysis.count({ where }),
			this.prisma.aiAnalysis.groupBy({ by: ['subjectId'], where }),
			this.prisma.aiAnalysis.count({ where: { ...where, riskLevel: 'high' } }),
		]);

		return { totalCount, subjectCount: subjectGroups.length, highRiskCount };
	}

	listMessages(analysisId: string): Promise<readonly AiAnalysisMessage[]> {
		return this.prisma.aiAnalysisMessage.findMany({ where: { analysisId }, orderBy: { createdAt: 'asc' }, take: MAX_MESSAGES });
	}

	addMessage(analysisId: string, role: AiMessageRole, content: string): Promise<AiAnalysisMessage> {
		return this.prisma.aiAnalysisMessage.create({ data: { analysisId, role, content } });
	}
}

// Rows strictly older than the cursor, with the id breaking ties between
// analyses stamped in the same millisecond.
function toCursorFilter(page: PageRequest): Prisma.AiAnalysisWhereInput {
	if (!page.cursor) {
		return {};
	}

	return { OR: [{ requestedAt: { lt: page.cursor.orderedAt } }, { requestedAt: page.cursor.orderedAt, id: { lt: page.cursor.id } }] };
}
