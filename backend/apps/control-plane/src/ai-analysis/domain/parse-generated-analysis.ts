import type { AiRiskLevel, AiTrend } from '@prisma/control-plane-client';

import { GATEWAY_PROPOSAL_TYPES, InvalidProposalError, parseGatewayProposal, type GatewayProposal } from './gateway-proposal.js';

const RISK_LEVELS: readonly AiRiskLevel[] = ['low', 'medium', 'high'];
const TRENDS: readonly AiTrend[] = ['improved', 'stable', 'worsened'];

export type SuggestedAction = GatewayProposal;

export const SUGGESTED_ACTION_TYPES = GATEWAY_PROPOSAL_TYPES;

export type GeneratedAnalysis = {
	readonly summary: string;
	readonly riskLevel: AiRiskLevel;
	readonly highlights: readonly string[];
	readonly recommendations: readonly string[];
	readonly suggestedActions: readonly SuggestedAction[];
	// Null when there was no previous analysis to compare with.
	readonly trend: AiTrend | null;
	readonly trendSummary: string | null;
};

// Provider answered, but not in the shape asked for.
export class InvalidAnalysisResponseError extends Error {}

// A malformed suggestion fails the whole analysis response, as a
// malformed summary would.
export function parseSuggestedAction(raw: unknown): SuggestedAction {
	try {
		return parseGatewayProposal(raw);
	} catch (error) {
		if (error instanceof InvalidProposalError) {
			throw new InvalidAnalysisResponseError(`Suggested action: ${error.message}`);
		}

		throw error;
	}
}

export function parseSuggestedActions(raw: unknown): readonly SuggestedAction[] {
	if (raw === undefined || raw === null) {
		return [];
	}

	if (!Array.isArray(raw)) {
		throw new InvalidAnalysisResponseError('"suggestedActions" is not an array');
	}

	return raw.map(parseSuggestedAction);
}

export function parseGeneratedAnalysis(rawInput: unknown): GeneratedAnalysis {
	if (!isRecord(rawInput)) {
		throw new InvalidAnalysisResponseError('Tool call input was not an object');
	}

	const candidate = rawInput;
	const hasSummary = typeof candidate.summary === 'string' && candidate.summary.trim().length > 0;

	if (!hasSummary) {
		throw new InvalidAnalysisResponseError('Tool call input is missing a non-empty "summary" string');
	}

	if (!isRiskLevel(candidate.riskLevel)) {
		throw new InvalidAnalysisResponseError(`Tool call input has an invalid "riskLevel": ${String(candidate.riskLevel)}`);
	}

	if (!isStringArray(candidate.highlights)) {
		throw new InvalidAnalysisResponseError('Tool call input is missing a "highlights" string array');
	}

	if (!isStringArray(candidate.recommendations)) {
		throw new InvalidAnalysisResponseError('Tool call input is missing a "recommendations" string array');
	}

	const hasTrend = candidate.trend !== undefined && candidate.trend !== null && candidate.trend !== 'first';

	if (hasTrend && !isTrend(candidate.trend)) {
		throw new InvalidAnalysisResponseError(`Tool call input has an invalid "trend": ${String(candidate.trend)}`);
	}

	const trendSummary = typeof candidate.trendSummary === 'string' && candidate.trendSummary.trim().length > 0 ? candidate.trendSummary : null;

	return {
		summary: candidate.summary as string,
		riskLevel: candidate.riskLevel,
		highlights: candidate.highlights,
		recommendations: candidate.recommendations,
		suggestedActions: parseSuggestedActions(candidate.suggestedActions),
		trend: hasTrend ? (candidate.trend as AiTrend) : null,
		trendSummary: hasTrend ? trendSummary : null,
	};
}

function isRiskLevel(value: unknown): value is AiRiskLevel {
	return typeof value === 'string' && (RISK_LEVELS as readonly string[]).includes(value);
}

function isTrend(value: unknown): value is AiTrend {
	return typeof value === 'string' && (TRENDS as readonly string[]).includes(value);
}

function isStringArray(value: unknown): value is readonly string[] {
	return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}
