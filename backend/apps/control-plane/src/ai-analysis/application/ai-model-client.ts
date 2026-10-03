import type { AiAnalysisScope } from '@prisma/control-plane-client';

import type { GeneratedAnalysis } from '../domain/parse-generated-analysis.js';
import type { AiAnalysisDto, AiAnalysisMessageDto } from '../interface/dto/ai-analysis.dto.js';
import type { AiTool } from './ai-tool.js';

// Null for the whole gateway; a service subject carries its slug (the tools address
// services by slug).
export type AnalysisSubject = { readonly id: string; readonly name: string; readonly slug?: string | null } | null;

export type AnalysisRunRequest = {
	readonly scope: AiAnalysisScope;
	readonly subject: AnalysisSubject;
	readonly windowMinutes: number | null;
	readonly tools: readonly AiTool[];
	// The previous analysis of the same scope+subject, for the trend.
	readonly previousAnalysis: AiAnalysisDto | null;
	// Fetched up front to save the model a round trip.
	readonly initialContext: string | null;
};

export type ReplyRequest = {
	readonly analysis: AiAnalysisDto;
	readonly history: readonly AiAnalysisMessageDto[];
	readonly question: string;
	readonly tools: readonly AiTool[];
};

export type ConversationMessage = { readonly role: 'user' | 'assistant'; readonly content: string };

export type ConversationRequest = {
	readonly systemPrompt: string;
	readonly messages: readonly ConversationMessage[];
	readonly tools: readonly AiTool[];
};

export type ConversationResult = {
	readonly text: string;
	// In call order, shown in the console.
	readonly toolCalls: readonly string[];
};

export type ModelStreamEvent =
	| { readonly type: 'text'; readonly delta: string }
	| { readonly type: 'tool_call'; readonly name: string }
	| { readonly type: 'done'; readonly text: string };

// An abstract class, not an interface, so it doubles as the Nest injection token.
export abstract class AiModelClient {
	// Stored with every analysis, so it stays clear which model said what.
	abstract getModelId(): string;
	abstract runAnalysis(request: AnalysisRunRequest): Promise<GeneratedAnalysis>;
	abstract streamReply(request: ReplyRequest): AsyncIterable<ModelStreamEvent>;
	abstract runConversation(request: ConversationRequest): Promise<ConversationResult>;
}

// Mapped to a 503 the console explains.
export class AiNotConfiguredError extends Error {}

// Mapped to a 429.
export class AiProviderRateLimitedError extends Error {}

// The provider refused the credentials (a wrong or revoked AI_API_KEY): mapped to a 503,
// since only whoever runs the control plane can fix it.
export class AiProviderAuthError extends Error {}
