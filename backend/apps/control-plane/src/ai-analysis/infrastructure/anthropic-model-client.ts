import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getAiApiKey, getAiModelId } from '../../config/ai-provider.js';
import {
	AiModelClient,
	AiNotConfiguredError,
	AiProviderAuthError,
	AiProviderRateLimitedError,
	type AnalysisRunRequest,
	type ConversationRequest,
	type ConversationResult,
	type ModelStreamEvent,
	type ReplyRequest,
} from '../application/ai-model-client.js';
import type { AiTool } from '../application/ai-tool.js';
import {
	buildAnalysisSystemPrompt,
	buildAnalysisUserPrompt,
	buildReplyContextPrompt,
	buildReplySystemPrompt,
	RECORD_ANALYSIS_SCHEMA,
	RECORD_ANALYSIS_TOOL_NAME,
} from '../application/analysis-prompts.js';
import { InvalidAnalysisResponseError, parseGeneratedAnalysis, type GeneratedAnalysis } from '../domain/parse-generated-analysis.js';

const MAX_OUTPUT_TOKENS = 8000;
// Enough to read several sources, not enough to loop.
const MAX_ANALYSIS_ITERATIONS = 12;
const MAX_REPLY_ITERATIONS = 6;
// The assistant may read several sources and record several proposals
// before answering.
const MAX_CONVERSATION_ITERATIONS = 10;
const RECORDED_RESULT = 'Recorded.';

type ToolRunOutcome = { readonly result: Anthropic.ToolResultBlockParam; readonly recorded: GeneratedAnalysis | null };

// The client and model id are resolved on first use, so a control plane that never analyzes
// needs no AI key to boot. Streamed, so a long investigation never trips the HTTP timeout.
@Injectable()
export class AnthropicModelClient extends AiModelClient {
	private readonly logger = new Logger(AnthropicModelClient.name);
	private client: Anthropic | undefined;

	constructor(private readonly createClient: (apiKey: string) => Anthropic = (apiKey) => new Anthropic({ apiKey })) {
		super();
	}

	getModelId(): string {
		return this.readConfig(getAiModelId);
	}

	private getClient(): Anthropic {
		if (!this.client) {
			this.client = this.createClient(this.readConfig(getAiApiKey));
		}

		return this.client;
	}

	private readConfig(read: () => string): string {
		try {
			return read();
		} catch (error) {
			throw new AiNotConfiguredError(error instanceof Error ? error.message : 'AI provider is not configured');
		}
	}

	async runAnalysis(request: AnalysisRunRequest): Promise<GeneratedAnalysis> {
		try {
			return await this.runAnalysisTurns(request);
		} catch (error) {
			throw toProviderError(error);
		}
	}

	async *streamReply(request: ReplyRequest): AsyncIterable<ModelStreamEvent> {
		try {
			yield* this.streamReplyTurns(request);
		} catch (error) {
			throw toProviderError(error);
		}
	}

	async runConversation(request: ConversationRequest): Promise<ConversationResult> {
		try {
			return await this.runConversationTurns(request);
		} catch (error) {
			throw toProviderError(error);
		}
	}

	private async runAnalysisTurns(request: AnalysisRunRequest): Promise<GeneratedAnalysis> {
		const client = this.getClient();
		const tools = [...request.tools.map(toAnthropicTool), buildRecordAnalysisTool()];
		const messages: Anthropic.MessageParam[] = [{ role: 'user', content: buildAnalysisUserPrompt(request) }];

		for (let iteration = 0; iteration < MAX_ANALYSIS_ITERATIONS; iteration += 1) {
			const stream = client.messages.stream({
				model: this.getModelId(),
				max_tokens: MAX_OUTPUT_TOKENS,
				system: buildAnalysisSystemPrompt(),
				tools,
				messages,
			});
			const message = await stream.finalMessage();

			this.assertNotRefused(message);
			messages.push({ role: 'assistant', content: message.content });

			const toolUses = toolUseBlocksOf(message);

			if (toolUses.length === 0) {
				// Plain text instead of the record tool: ask once, then give up.
				messages.push({ role: 'user', content: `Call the "${RECORD_ANALYSIS_TOOL_NAME}" tool with your assessment now.` });
				continue;
			}

			const outcomes = await Promise.all(toolUses.map((toolUse) => this.runTool(toolUse, request.tools)));

			messages.push({ role: 'user', content: outcomes.map((outcome) => outcome.result) });
			const recorded = outcomes.find((outcome) => outcome.recorded !== null)?.recorded;

			if (recorded) {
				return recorded;
			}
		}

		throw new InvalidAnalysisResponseError(`Model did not call "${RECORD_ANALYSIS_TOOL_NAME}" within ${MAX_ANALYSIS_ITERATIONS} turns`);
	}

	private async *streamReplyTurns(request: ReplyRequest): AsyncIterable<ModelStreamEvent> {
		const client = this.getClient();
		const tools = request.tools.map(toAnthropicTool);
		const history: Anthropic.MessageParam[] = request.history.map((message) => ({ role: message.role, content: message.content }));
		const messages: Anthropic.MessageParam[] = [
			{ role: 'user', content: buildReplyContextPrompt(request) },
			{ role: 'assistant', content: 'Entendido. Pode perguntar.' },
			...history,
			{ role: 'user', content: request.question },
		];
		let fullText = '';

		for (let iteration = 0; iteration < MAX_REPLY_ITERATIONS; iteration += 1) {
			const stream = client.messages.stream({
				model: this.getModelId(),
				max_tokens: MAX_OUTPUT_TOKENS,
				system: buildReplySystemPrompt(),
				tools,
				messages,
			});

			for await (const event of stream) {
				const streamed = toStreamEvent(event);

				if (!streamed) {
					continue;
				}

				if (streamed.type === 'text') {
					fullText += streamed.delta;
				}

				yield streamed;
			}

			const message = await stream.finalMessage();

			this.assertNotRefused(message);
			messages.push({ role: 'assistant', content: message.content });

			const toolUses = toolUseBlocksOf(message);

			if (toolUses.length === 0) {
				yield { type: 'done', text: fullText || textOf(message) };

				return;
			}

			const outcomes = await Promise.all(toolUses.map((toolUse) => this.runTool(toolUse, request.tools)));

			messages.push({ role: 'user', content: outcomes.map((outcome) => outcome.result) });
		}

		yield { type: 'done', text: fullText };
	}

	private async runConversationTurns(request: ConversationRequest): Promise<ConversationResult> {
		const client = this.getClient();
		const tools = request.tools.map(toAnthropicTool);
		const messages: Anthropic.MessageParam[] = request.messages.map((message) => ({ role: message.role, content: message.content }));
		const toolCalls: string[] = [];

		for (let iteration = 0; iteration < MAX_CONVERSATION_ITERATIONS; iteration += 1) {
			const stream = client.messages.stream({
				model: this.getModelId(),
				max_tokens: MAX_OUTPUT_TOKENS,
				system: request.systemPrompt,
				tools,
				messages,
			});
			const message = await stream.finalMessage();

			this.assertNotRefused(message);
			messages.push({ role: 'assistant', content: message.content });

			const toolUses = toolUseBlocksOf(message);

			if (toolUses.length === 0) {
				return { text: textOf(message), toolCalls };
			}

			toolCalls.push(...toolUses.map((toolUse) => toolUse.name));
			const outcomes = await Promise.all(toolUses.map((toolUse) => this.runTool(toolUse, request.tools)));

			messages.push({ role: 'user', content: outcomes.map((outcome) => outcome.result) });
		}

		throw new Error(`Model did not answer within ${MAX_CONVERSATION_ITERATIONS} turns`);
	}

	// A failing tool is reported back as an error result, so the model can correct itself.
	private async runTool(toolUse: Anthropic.ToolUseBlock, tools: readonly AiTool[]): Promise<ToolRunOutcome> {
		if (toolUse.name === RECORD_ANALYSIS_TOOL_NAME) {
			const recorded = parseGeneratedAnalysis(toolUse.input);

			return { result: { type: 'tool_result', tool_use_id: toolUse.id, content: RECORDED_RESULT }, recorded };
		}

		const tool = tools.find((candidate) => candidate.name === toolUse.name);

		if (!tool) {
			return { result: { type: 'tool_result', tool_use_id: toolUse.id, content: `Unknown tool "${toolUse.name}"`, is_error: true }, recorded: null };
		}

		try {
			const input = typeof toolUse.input === 'object' && toolUse.input !== null ? (toolUse.input as Record<string, unknown>) : {};
			const content = await tool.run(input);

			return { result: { type: 'tool_result', tool_use_id: toolUse.id, content }, recorded: null };
		} catch (error) {
			this.logger.warn(`Tool ${toolUse.name} failed: ${toErrorMessage(error)}`);

			return { result: { type: 'tool_result', tool_use_id: toolUse.id, content: toErrorMessage(error), is_error: true }, recorded: null };
		}
	}

	private assertNotRefused(message: Anthropic.Message): void {
		if (message.stop_reason === 'refusal') {
			throw new Error('The model declined to answer this request');
		}
	}
}

function toAnthropicTool(tool: AiTool): Anthropic.Tool {
	const inputSchema: Anthropic.Tool.InputSchema = { ...tool.inputSchema, required: [...tool.inputSchema.required] };

	return { name: tool.name, description: tool.description, input_schema: inputSchema };
}

function buildRecordAnalysisTool(): Anthropic.Tool {
	return {
		name: RECORD_ANALYSIS_TOOL_NAME,
		description: 'Records your final, structured assessment. Call it exactly once, when the investigation is complete.',
		input_schema: RECORD_ANALYSIS_SCHEMA as unknown as Anthropic.Tool.InputSchema,
	};
}

function toolUseBlocksOf(message: Anthropic.Message): readonly Anthropic.ToolUseBlock[] {
	return message.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
}

function textOf(message: Anthropic.Message): string {
	return message.content
		.filter((block): block is Anthropic.TextBlock => block.type === 'text')
		.map((block) => block.text)
		.join('');
}

function toStreamEvent(event: Anthropic.MessageStreamEvent): ModelStreamEvent | null {
	if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
		return { type: 'text', delta: event.delta.text };
	}

	if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
		return { type: 'tool_call', name: event.content_block.name };
	}

	return null;
}

// The SDK's typed refusals, as the errors the services map to HTTP statuses.
function toProviderError(error: unknown): unknown {
	const isAuthRejected = error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError;

	if (isAuthRejected) {
		return new AiProviderAuthError(error.message);
	}

	if (error instanceof Anthropic.RateLimitError) {
		return new AiProviderRateLimitedError(error.message);
	}

	return error;
}
