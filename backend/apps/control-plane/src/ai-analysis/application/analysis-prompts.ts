import type { AiAnalysisScope } from '@prisma/control-plane-client';

import { LOAD_BALANCING_STRATEGY_NAMES } from '@pyle/shared/contracts/config-snapshot.js';
import { GATEWAY_ALERT_KIND_NAMES } from '@pyle/shared/contracts/names.js';

import { ANALYSIS_SCOPES } from '../domain/analysis-scope.js';
import { SUGGESTED_ACTION_TYPES } from '../domain/parse-generated-analysis.js';
import type { AnalysisRunRequest, ReplyRequest } from './ai-model-client.js';
import { GATEWAY_CONCEPTS, INVESTIGATION_METHOD, OUTPUT_LANGUAGE, OUTPUT_STYLE } from './gateway-concepts.js';

export const RECORD_ANALYSIS_TOOL_NAME = 'record_analysis';

const FOCUS_BY_SCOPE: Readonly<Record<AiAnalysisScope, string>> = {
	platform: 'the whole gateway: platform health, traffic across every route, instance health and open alerts',
	route: 'one route: its traffic, latency percentiles, error and 429 rates, and how its requests spread across instances',
	service: 'one service: the health, circuit state, traffic share, latency and errors of each of its instances',
};

// The tool whose result starts each kind of analysis.
export const INITIAL_TOOL_BY_SCOPE: Readonly<Record<AiAnalysisScope, string>> = {
	platform: 'get_traffic_overview',
	route: 'get_route_stats',
	service: 'get_service_instances',
};

// Stable across requests, so the provider can cache the prefix.
export function buildAnalysisSystemPrompt(): string {
	return [
		GATEWAY_CONCEPTS,
		'You investigate with the tools provided: fetch what you need, call several tools when useful, and widen the window when the default is too short to see a trend.',
		INVESTIGATION_METHOD,
		OUTPUT_STYLE,
		`When you are done, call the "${RECORD_ANALYSIS_TOOL_NAME}" tool exactly once with your assessment. Do not answer in plain text.`,
		'Trend: when a previous analysis of the same scope is given, judge whether the situation improved, stayed stable or worsened since then and explain what changed in one or two sentences; with no previous analysis, omit the trend.',
		`Suggested actions: only propose one of ${SUGGESTED_ACTION_TYPES.join(', ')} when the data clearly warrants it and the operator would reasonably agree; use the exact ids and names you fetched, and give each a concrete reason. An empty list is the normal outcome.`,
	].join('\n');
}

export function buildAnalysisUserPrompt(request: AnalysisRunRequest): string {
	const previous = request.previousAnalysis
		? `Previous analysis of this scope (${request.previousAnalysis.requestedAt}):\n${JSON.stringify(previousForPrompt(request.previousAnalysis))}`
		: 'There is no previous analysis of this scope.';
	const context =
		request.initialContext === null ? [] : [`Already fetched for you (${INITIAL_TOOL_BY_SCOPE[request.scope]}):\n${request.initialContext}`];

	return [`Analyze ${FOCUS_BY_SCOPE[request.scope]}.`, describeSubject(request), previous, ...context].join('\n');
}

export function buildReplySystemPrompt(): string {
	return [
		GATEWAY_CONCEPTS,
		'You are continuing a conversation with the operator about one analysis you produced. Answer their question directly, grounded in the analysis and, whenever the question needs current numbers or something the analysis did not cover, in fresh data from the tools.',
		INVESTIGATION_METHOD,
		`${OUTPUT_STYLE} Be concise: a few sentences or a short list.`,
		'You cannot change anything yourself: if the operator asks you to act, point them to the console page or the command assistant.',
	].join('\n');
}

export function buildReplyContextPrompt(request: ReplyRequest): string {
	const { analysis } = request;
	const subject = analysis.subjectId ? `${analysis.scope} "${analysis.subjectName}" (id "${analysis.subjectId}")` : 'the whole gateway';

	return [
		`The analysis under discussion (scope "${analysis.scope}", about ${subject}, generated ${analysis.requestedAt}):`,
		JSON.stringify({
			summary: analysis.summary,
			riskLevel: analysis.riskLevel,
			highlights: analysis.highlights,
			recommendations: analysis.recommendations,
			suggestedActions: analysis.suggestedActions,
			trend: analysis.trend,
			trendSummary: analysis.trendSummary,
		}),
	].join('\n');
}

function describeSubject(request: AnalysisRunRequest): string {
	if (!request.subject) {
		return 'Subject: the whole platform.';
	}

	const window = request.windowMinutes ? ` Traffic window of interest: the last ${request.windowMinutes} minutes.` : '';

	return `Subject: ${request.scope} "${request.subject.name}" (id "${request.subject.id}").${window}`;
}

function previousForPrompt(analysis: AnalysisRunRequest['previousAnalysis'] & object): Record<string, unknown> {
	return { summary: analysis.summary, riskLevel: analysis.riskLevel, highlights: analysis.highlights, recommendations: analysis.recommendations };
}

// Every field any proposal type uses; which ones apply depends on "type"
// (the assistant's propose_* tools document each type in full).
const PROPOSAL_FIELDS = {
	serviceSlug: { type: 'string', description: 'Instance and service actions, create_route' },
	instanceId: { type: 'string' },
	instanceName: { type: 'string' },
	weight: { type: 'integer', description: 'set_instance_weight: 1-100' },
	strategy: { type: 'string', enum: [...LOAD_BALANCING_STRATEGY_NAMES], description: 'set_lb_strategy' },
	timeoutMs: { type: 'integer', description: 'set_service_timeout / set_route_timeout: 100-60000' },
	retryMaxAttempts: { type: 'integer', description: 'set_service_retries: 1-5' },
	routeId: { type: 'string' },
	routeName: { type: 'string' },
	rateLimitPerMinute: { type: 'integer', description: 'Route or consumer limit' },
	consumerSlug: { type: 'string' },
	consumerName: { type: 'string' },
	keyId: { type: 'string' },
	keyPrefix: { type: 'string' },
	slug: { type: 'string', description: 'create_consumer' },
	name: { type: 'string', description: 'create_consumer / create_route' },
	pathPrefix: { type: 'string', description: 'create_route' },
	isAuthRequired: { type: 'boolean', description: 'create_route' },
	kind: { type: 'string', enum: [...GATEWAY_ALERT_KIND_NAMES], description: 'update_alert_rule' },
	isEnabled: { type: 'boolean', description: 'update_alert_rule' },
	threshold: { type: 'number', description: 'update_alert_rule: ms for route_p95_latency, percent for route_error_rate; omit for the others' },
	sustainedWindows: { type: 'integer', description: 'update_alert_rule: consecutive 10 s windows' },
	scope: { type: 'string', enum: [...ANALYSIS_SCOPES], description: 'generate_analysis' },
	subjectId: { type: 'string', description: 'generate_analysis: route or service id' },
	subjectName: { type: 'string', description: 'generate_analysis' },
	windowMinutes: { type: 'integer', description: 'generate_analysis' },
	serviceName: { type: 'string', description: 'scale_service' },
	managedReplicas: { type: 'integer', description: 'scale_service: managed (Docker) replicas wanted, 0-10' },
	currentManagedReplicas: { type: 'integer', description: 'scale_service: managed replicas the service has now' },
} as const;

export const RECORD_ANALYSIS_SCHEMA = {
	type: 'object',
	properties: {
		summary: { type: 'string', description: `Two or three sentences an operator can read at a glance, in ${OUTPUT_LANGUAGE}.` },
		riskLevel: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Overall risk implied by the data.' },
		highlights: {
			type: 'array',
			items: { type: 'string' },
			description: `Three to six concrete observations backed by numbers you fetched (trends, peaks, anomalies, what is healthy), in ${OUTPUT_LANGUAGE}.`,
		},
		recommendations: {
			type: 'array',
			items: { type: 'string' },
			description: `Concrete, actionable next steps for the operator, if any; empty when nothing needs doing, in ${OUTPUT_LANGUAGE}.`,
		},
		trend: {
			type: 'string',
			enum: ['improved', 'stable', 'worsened'],
			description: 'Only when a previous analysis was given: how the situation moved since it.',
		},
		trendSummary: {
			type: 'string',
			description: `Only with a trend: what changed since the previous analysis, one or two sentences in ${OUTPUT_LANGUAGE}.`,
		},
		suggestedActions: {
			type: 'array',
			description: 'Actions the operator can run from the console with one confirmation. Usually empty.',
			items: {
				type: 'object',
				properties: {
					type: { type: 'string', enum: [...SUGGESTED_ACTION_TYPES] },
					reason: { type: 'string', description: `Why, in one sentence, in ${OUTPUT_LANGUAGE}.` },
					...PROPOSAL_FIELDS,
				},
				required: ['type', 'reason'],
				additionalProperties: false,
			},
		},
	},
	required: ['summary', 'riskLevel', 'highlights', 'recommendations'],
	additionalProperties: false,
} as const;
