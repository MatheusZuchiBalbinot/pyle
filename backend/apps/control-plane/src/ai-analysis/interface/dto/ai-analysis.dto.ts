import { ApiProperty } from '@nestjs/swagger';
import type { AiAnalysis, AiAnalysisMessage, AiAnalysisScope, AiMessageRole, AiRiskLevel, AiTrend } from '@prisma/control-plane-client';

import type { Page } from '../../../common/pagination.js';
import { parseSuggestedActions, type SuggestedAction } from '../../domain/parse-generated-analysis.js';
import type { AiAnalysisSummary } from '../../infrastructure/ai-analysis.repository.js';
import { GATEWAY_PROPOSAL_LIST_SCHEMA } from './gateway-proposal-schema.js';

export class AiAnalysisDto {
	readonly id!: string;
	readonly scope!: AiAnalysisScope;
	// Route or service id; null for the platform scope.
	readonly subjectId!: string | null;
	// The subject's name when the analysis ran (it may be deleted since).
	readonly subjectName!: string | null;
	readonly windowMinutes!: number | null;
	readonly summary!: string;
	readonly riskLevel!: AiRiskLevel;
	@ApiProperty({ type: [String] })
	readonly highlights!: readonly string[];
	@ApiProperty({ type: [String] })
	readonly recommendations!: readonly string[];
	@ApiProperty(GATEWAY_PROPOSAL_LIST_SCHEMA)
	readonly suggestedActions!: readonly SuggestedAction[];
	readonly trend!: AiTrend | null;
	readonly trendSummary!: string | null;
	readonly previousAnalysisId!: string | null;
	readonly model!: string;
	readonly requestedAt!: string;
}

export class AiAnalysisPageDto implements Page<AiAnalysisDto> {
	@ApiProperty({ type: [AiAnalysisDto] })
	readonly items!: readonly AiAnalysisDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
}

export class AiAnalysisMessageDto {
	readonly id!: string;
	readonly role!: AiMessageRole;
	readonly content!: string;
	readonly createdAt!: string;
}

export class AiAnalysisSummaryDto implements AiAnalysisSummary {
	readonly totalCount!: number;
	// Distinct subjects: each route or service, plus the platform counted once.
	readonly subjectCount!: number;
	readonly highRiskCount!: number;
}

export function toAiAnalysisDto(analysis: AiAnalysis): AiAnalysisDto {
	return {
		id: analysis.id,
		scope: analysis.scope,
		subjectId: analysis.subjectId,
		subjectName: analysis.subjectName,
		windowMinutes: analysis.windowMinutes,
		summary: analysis.summary,
		riskLevel: analysis.riskLevel,
		highlights: analysis.highlights,
		recommendations: analysis.recommendations,
		suggestedActions: readSuggestedActions(analysis.suggestedActions),
		trend: analysis.trend,
		trendSummary: analysis.trendSummary,
		previousAnalysisId: analysis.previousAnalysisId,
		model: analysis.model,
		requestedAt: analysis.requestedAt.toISOString(),
	};
}

export function toAiAnalysisMessageDto(message: AiAnalysisMessage): AiAnalysisMessageDto {
	return { id: message.id, role: message.role, content: message.content, createdAt: message.createdAt.toISOString() };
}

// Re-parsed on the way out in case a row was written by something else (the seeder).
function readSuggestedActions(raw: unknown): readonly SuggestedAction[] {
	try {
		return parseSuggestedActions(raw);
	} catch {
		// Silently fall back to empty list on parse errors to prevent corruption
		return [];
	}
}
