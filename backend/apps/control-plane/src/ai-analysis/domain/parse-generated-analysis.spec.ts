import { describe, expect, it } from 'vitest';

import { InvalidAnalysisResponseError, parseGeneratedAnalysis, parseSuggestedAction } from './parse-generated-analysis.js';

const VALID = { summary: 'All good', riskLevel: 'low', highlights: ['CPU idle'], recommendations: [] };
const PARSED_VALID = { ...VALID, suggestedActions: [], trend: null, trendSummary: null };
const ALERT_RULE_ACTION = {
	type: 'update_alert_rule',
	kind: 'route_p95_latency',
	isEnabled: true,
	threshold: 1200,
	sustainedWindows: 3,
	reason: 'O p95 normal de /api/orders já passa de 800 ms',
};
const ANALYSIS_ACTION = {
	type: 'generate_analysis',
	scope: 'route',
	subjectId: '5b9f0a3e-0000-4000-8000-000000000001',
	subjectName: 'Pedidos',
	windowMinutes: 60,
	reason: 'Olhar a rota com mais erro',
};

describe('parseGeneratedAnalysis', () => {
	it('accepts a well-formed tool input, defaulting the optional parts', () => {
		expect(parseGeneratedAnalysis(VALID)).toEqual(PARSED_VALID);
	});

	it('keeps the trend and its summary when the model compared with a previous analysis', () => {
		const parsed = parseGeneratedAnalysis({ ...VALID, trend: 'worsened', trendSummary: 'CPU dobrou' });

		expect(parsed.trend).toBe('worsened');
		expect(parsed.trendSummary).toBe('CPU dobrou');
	});

	it('drops the trend summary when there is no trend', () => {
		expect(parseGeneratedAnalysis({ ...VALID, trendSummary: 'stale' }).trendSummary).toBeNull();
	});

	it('validates every suggested action', () => {
		const action = { ...ALERT_RULE_ACTION };

		expect(parseGeneratedAnalysis({ ...VALID, suggestedActions: [action] }).suggestedActions).toEqual([action]);
		expect(() => parseGeneratedAnalysis({ ...VALID, suggestedActions: [{ type: 'update_alert_rule', reason: 'x' }] })).toThrow(
			InvalidAnalysisResponseError,
		);
	});

	it.each([
		['non-object', 'nope'],
		['empty summary', { ...VALID, summary: '  ' }],
		['unknown risk level', { ...VALID, riskLevel: 'critical' }],
		['unknown trend', { ...VALID, trend: 'sideways' }],
		['highlights not strings', { ...VALID, highlights: [1] }],
		['missing recommendations', { summary: 'x', riskLevel: 'low', highlights: [] }],
		['suggestedActions not an array', { ...VALID, suggestedActions: {} }],
	])('rejects %s', (_label, input) => {
		expect(() => parseGeneratedAnalysis(input)).toThrow(InvalidAnalysisResponseError);
	});
});

describe('parseSuggestedAction', () => {
	it.each([ALERT_RULE_ACTION, ANALYSIS_ACTION])('accepts $type with its own fields', (action) => {
		expect(parseSuggestedAction(action)).toEqual(action);
	});

	it('defaults the optional analysis fields to null', () => {
		const parsed = parseSuggestedAction({ type: 'generate_analysis', scope: 'platform', reason: 'visão geral' });

		expect(parsed).toEqual({
			type: 'generate_analysis',
			scope: 'platform',
			subjectId: null,
			subjectName: null,
			windowMinutes: null,
			reason: 'visão geral',
		});
	});

	it('accepts a rule without a threshold', () => {
		const action = { ...ALERT_RULE_ACTION, kind: 'circuit_open', threshold: null };

		expect(parseSuggestedAction(action)).toEqual(action);
	});

	it.each([
		['not an object', 'x'],
		['an unknown type', { type: 'add_resource', reason: 'r' }],
		['no reason', { ...ALERT_RULE_ACTION, reason: ' ' }],
		['an unknown alert kind', { ...ALERT_RULE_ACTION, kind: 'high_cpu' }],
		['a missing switch', { ...ALERT_RULE_ACTION, isEnabled: undefined }],
		['a missing window count', { ...ALERT_RULE_ACTION, sustainedWindows: null }],
		['a non-numeric threshold', { ...ALERT_RULE_ACTION, threshold: '800' }],
		['an infinite threshold', { ...ALERT_RULE_ACTION, threshold: Number.POSITIVE_INFINITY }],
		['an unknown scope', { ...ANALYSIS_ACTION, scope: 'galaxy' }],
		['a non-string subject', { ...ANALYSIS_ACTION, subjectId: 42 }],
	])('rejects %s', (_label, raw) => {
		expect(() => parseSuggestedAction(raw)).toThrow(InvalidAnalysisResponseError);
	});
});
