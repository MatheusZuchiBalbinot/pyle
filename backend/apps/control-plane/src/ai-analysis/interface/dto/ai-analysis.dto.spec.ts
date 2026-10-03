import type { AiAnalysis } from '@prisma/control-plane-client';
import { describe, expect, it } from 'vitest';

import { toAiAnalysisDto } from './ai-analysis.dto.js';

function buildAnalysis(suggestedActions: unknown): AiAnalysis {
	return {
		id: 'a1',
		scope: 'platform',
		subjectId: null,
		subjectName: null,
		windowMinutes: 60,
		summary: 'Tudo bem',
		riskLevel: 'low',
		highlights: [],
		recommendations: [],
		suggestedActions,
		trend: null,
		trendSummary: null,
		previousAnalysisId: null,
		model: 'test-model',
		requestedAt: new Date('2026-09-25T10:00:00.000Z'),
	} as AiAnalysis;
}

describe('toAiAnalysisDto', () => {
	it('re-validates the stored suggested actions', () => {
		const action = { type: 'generate_analysis', scope: 'platform', subjectId: null, subjectName: null, windowMinutes: null, reason: 'r' };

		expect(toAiAnalysisDto(buildAnalysis([action])).suggestedActions).toEqual([action]);
	});

	// A stored action that no longer parses must not take the whole analysis down.
	it('drops stored actions that no longer parse instead of failing the analysis', () => {
		const dto = toAiAnalysisDto(buildAnalysis([{ type: 'pause_queue', queueId: 'q1', reason: 'r' }]));

		expect(dto.suggestedActions).toEqual([]);
		expect(dto.summary).toBe('Tudo bem');
	});
});
