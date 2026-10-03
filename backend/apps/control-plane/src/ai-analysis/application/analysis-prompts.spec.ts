import { describe, expect, it } from 'vitest';

import type { AnalysisRunRequest, ReplyRequest } from './ai-model-client.js';
import {
	buildAnalysisSystemPrompt,
	buildAnalysisUserPrompt,
	buildReplyContextPrompt,
	buildReplySystemPrompt,
	RECORD_ANALYSIS_SCHEMA,
	RECORD_ANALYSIS_TOOL_NAME,
} from './analysis-prompts.js';

const PREVIOUS = {
	id: 'a0',
	scope: 'route' as const,
	subjectId: 'r1',
	subjectName: 'Pedidos',
	windowMinutes: 60,
	summary: 'Estava tranquilo',
	riskLevel: 'low' as const,
	highlights: ['CPU 1%'],
	recommendations: ['nada a fazer'],
	suggestedActions: [],
	trend: null,
	trendSummary: null,
	previousAnalysisId: null,
	model: 'test-model',
	requestedAt: '2026-03-01T09:00:00.000Z',
};

function buildRunRequest(overrides: Partial<AnalysisRunRequest> = {}): AnalysisRunRequest {
	return {
		scope: 'route',
		subject: { id: 'r1', name: 'Pedidos' },
		windowMinutes: 60,
		tools: [],
		previousAnalysis: null,
		initialContext: null,
		...overrides,
	};
}

describe('the analysis prompt', () => {
	it('names the scope being analyzed', () => {
		expect(buildAnalysisUserPrompt(buildRunRequest())).toContain('Analyze');
	});

	it('names the subject and the window for a route run', () => {
		const prompt = buildAnalysisUserPrompt(buildRunRequest());

		expect(prompt).toContain('route "Pedidos" (id "r1")');
		expect(prompt).toContain('last 60 minutes');
	});

	it('says it is about the whole platform when there is no subject', () => {
		const prompt = buildAnalysisUserPrompt(buildRunRequest({ subject: null, windowMinutes: null }));

		expect(prompt).toContain('the whole platform');
		expect(prompt).not.toContain('id "');
	});

	it('leaves the window out when the scope has none', () => {
		const prompt = buildAnalysisUserPrompt(buildRunRequest({ windowMinutes: null }));

		expect(prompt).toContain('id "r1"');
		expect(prompt).not.toContain('Traffic window');
	});

	it('says plainly that there is nothing to compare with on a first run', () => {
		expect(buildAnalysisUserPrompt(buildRunRequest())).toContain('no previous analysis');
	});

	it('carries the previous analysis findings when there is one', () => {
		const prompt = buildAnalysisUserPrompt(buildRunRequest({ previousAnalysis: PREVIOUS }));

		expect(prompt).toContain(PREVIOUS.requestedAt);
		expect(prompt).toContain('Estava tranquilo');
		expect(prompt).toContain('CPU 1%');
	});

	// The prompt would otherwise grow without bound as analyses chain.
	it('carries only the findings, not the whole stored analysis', () => {
		const prompt = buildAnalysisUserPrompt(buildRunRequest({ previousAnalysis: PREVIOUS }));

		expect(prompt).not.toContain('test-model');
		expect(prompt).not.toContain('"id"');
	});

	it('tells the model which tool records its verdict', () => {
		expect(buildAnalysisSystemPrompt()).toContain(RECORD_ANALYSIS_TOOL_NAME);
	});

	it('explains the gateway and asks to correlate before concluding, with no dashes', () => {
		const prompt = buildAnalysisSystemPrompt();

		expect(prompt).toContain('least_connections');
		expect(prompt).toContain('get_health_events');
		expect(prompt).not.toContain('—');
		expect(JSON.stringify(RECORD_ANALYSIS_SCHEMA)).not.toContain('—');
	});

	it('describes that tool input as an object the parser can validate', () => {
		expect(RECORD_ANALYSIS_SCHEMA).toEqual(expect.objectContaining({ type: 'object' }));
	});
});

describe('the reply prompt', () => {
	function buildReplyRequest(): ReplyRequest {
		return { analysis: PREVIOUS, history: [], question: 'por quê?', tools: [] };
	}

	it('gives the model the analysis the question is about', () => {
		const prompt = buildReplyContextPrompt(buildReplyRequest());

		expect(prompt).toContain('Estava tranquilo');
	});

	it('has a system prompt of its own, distinct from the analysis one', () => {
		expect(buildReplySystemPrompt()).not.toBe(buildAnalysisSystemPrompt());
	});
});
