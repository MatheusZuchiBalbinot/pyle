import { Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getAiApiKey, getAiModelId } from '../../config/ai-provider.js';
import {
	AiModelClient,
	AiNotConfiguredError,
	AiProviderAuthError,
	AiProviderRateLimitedError,
	type AnalysisRunRequest,
	type ConversationMessage,
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

const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MAX_OUTPUT_TOKENS = 8000;
const MAX_ANALYSIS_ITERATIONS = 12;
const MAX_REPLY_ITERATIONS = 6;
const MAX_CONVERSATION_ITERATIONS = 10;
const RATE_LIMITED_STATUS = 429;
// A wrong key answers 401; a key without access to the model, 403.
const AUTH_REJECTED_STATUSES: ReadonlySet<number> = new Set([401, 403]);
// The free tier's small quota turns a tool loop into a burst of short 429s; waiting them
// out keeps the turn alive.
const MAX_RATE_LIMIT_RETRIES = 3;
const MAX_RATE_LIMIT_WAIT_MS = 30_000;
const RATE_LIMIT_WAIT_MARGIN_MS = 250;
const MS_PER_SECOND = 1000;
const RETRY_AFTER_HEADER = 'retry-after';
const RETRY_IN_SECONDS_PATTERN = /try again in ([\d.]+)s/i;
const RECORDED_RESULT = 'Recorded.';

export type FetchFunction = (url: string, init: RequestInit) => Promise<Response>;

type SleepFunction = (ms: number) => Promise<void>;

type GroqToolCall = {
	readonly id: string;
	readonly type: 'function';
	readonly function: { readonly name: string; readonly arguments: string };
};

type GroqMessage =
	| { readonly role: 'system'; readonly content: string }
	| { readonly role: 'user'; readonly content: string }
	| { readonly role: 'assistant'; readonly content: string | null; readonly tool_calls?: readonly GroqToolCall[] }
	| { readonly role: 'tool'; readonly tool_call_id: string; readonly name: string; readonly content: string };

type GroqAssistantMessage = { readonly content: string | null; readonly toolCalls: readonly GroqToolCall[] };

type GroqTool = {
	readonly type: 'function';
	readonly function: { readonly name: string; readonly description: string; readonly parameters: unknown };
};
type ToolRunOutcome = { readonly message: GroqMessage; readonly recorded: GeneratedAnalysis | null };

// OpenAI-compatible API over plain fetch. Replies are produced in full and then emitted
// (Groq is fast enough).
@Injectable()
export class GroqModelClient extends AiModelClient {
	private readonly logger = new Logger(GroqModelClient.name);

	constructor(
		private readonly fetchFunction: FetchFunction = (url, init) => fetch(url, init),
		private readonly sleep: SleepFunction = sleepFor,
	) {
		super();
	}

	getModelId(): string {
		return this.readConfig(getAiModelId);
	}

	private readConfig(read: () => string): string {
		try {
			return read();
		} catch (error) {
			throw new AiNotConfiguredError(error instanceof Error ? error.message : 'AI provider is not configured');
		}
	}

	async runAnalysis(request: AnalysisRunRequest): Promise<GeneratedAnalysis> {
		const tools = [...request.tools.map(toGroqTool), buildRecordAnalysisTool()];
		const messages: GroqMessage[] = [
			{ role: 'system', content: buildAnalysisSystemPrompt() },
			{ role: 'user', content: buildAnalysisUserPrompt(request) },
		];

		for (let iteration = 0; iteration < MAX_ANALYSIS_ITERATIONS; iteration += 1) {
			const message = await this.complete(messages, tools);

			messages.push(toAssistantHistoryMessage(message));

			if (message.toolCalls.length === 0) {
				messages.push({ role: 'user', content: `Call the "${RECORD_ANALYSIS_TOOL_NAME}" tool with your assessment now.` });
				continue;
			}

			const outcomes = await this.runToolCalls(message.toolCalls, request.tools);

			messages.push(...outcomes.map((outcome) => outcome.message));
			const recorded = outcomes.find((outcome) => outcome.recorded !== null)?.recorded;

			if (recorded) {
				return recorded;
			}
		}

		throw new InvalidAnalysisResponseError(`Model did not call "${RECORD_ANALYSIS_TOOL_NAME}" within ${MAX_ANALYSIS_ITERATIONS} turns`);
	}

	async *streamReply(request: ReplyRequest): AsyncIterable<ModelStreamEvent> {
		const tools = request.tools.map(toGroqTool);
		const messages: GroqMessage[] = [
			{ role: 'system', content: buildReplySystemPrompt() },
			{ role: 'user', content: buildReplyContextPrompt(request) },
			{ role: 'assistant', content: 'Entendido. Pode perguntar.' },
			...request.history.map(toGroqMessage),
			{ role: 'user', content: request.question },
		];

		for (let iteration = 0; iteration < MAX_REPLY_ITERATIONS; iteration += 1) {
			const message = await this.complete(messages, tools);

			messages.push(toAssistantHistoryMessage(message));

			if (message.toolCalls.length === 0) {
				const text = message.content ?? '';

				yield { type: 'text', delta: text };
				yield { type: 'done', text };

				return;
			}

			for (const toolCall of message.toolCalls) {
				yield { type: 'tool_call', name: toolCall.function.name };
			}

			const outcomes = await this.runToolCalls(message.toolCalls, request.tools);

			messages.push(...outcomes.map((outcome) => outcome.message));
		}

		yield { type: 'done', text: '' };
	}

	async runConversation(request: ConversationRequest): Promise<ConversationResult> {
		const tools = request.tools.map(toGroqTool);
		const messages: GroqMessage[] = [{ role: 'system', content: request.systemPrompt }, ...request.messages.map(toGroqMessage)];
		const toolCalls: string[] = [];

		for (let iteration = 0; iteration < MAX_CONVERSATION_ITERATIONS; iteration += 1) {
			const message = await this.complete(messages, tools);

			messages.push(toAssistantHistoryMessage(message));

			if (message.toolCalls.length === 0) {
				return { text: message.content ?? '', toolCalls };
			}

			toolCalls.push(...message.toolCalls.map((toolCall) => toolCall.function.name));
			const outcomes = await this.runToolCalls(message.toolCalls, request.tools);

			messages.push(...outcomes.map((outcome) => outcome.message));
		}

		throw new Error(`Model did not answer within ${MAX_CONVERSATION_ITERATIONS} turns`);
	}

	private async complete(messages: readonly GroqMessage[], tools: readonly GroqTool[]): Promise<GroqAssistantMessage> {
		const apiKey = this.readConfig(getAiApiKey);
		const body = { model: this.getModelId(), messages, tools, tool_choice: 'auto', max_completion_tokens: MAX_OUTPUT_TOKENS };
		const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
		const init: RequestInit = { method: 'POST', headers, body: JSON.stringify(body) };
		const response = await this.fetchWithRateLimitRetries(init);

		if (!response.ok) {
			throw await toProviderError(response);
		}

		const responseBody: unknown = await response.json();

		return parseAssistantMessage(responseBody);
	}

	private async fetchWithRateLimitRetries(init: RequestInit): Promise<Response> {
		for (let attempt = 0; ; attempt += 1) {
			const response = await this.fetchFunction(GROQ_CHAT_COMPLETIONS_URL, init);

			if (response.status !== RATE_LIMITED_STATUS) {
				return response;
			}

			const message = await readProviderError(response);
			const delayMs = readRetryDelayMs(response, message);
			const canWait = delayMs !== null && delayMs <= MAX_RATE_LIMIT_WAIT_MS && attempt < MAX_RATE_LIMIT_RETRIES;

			if (!canWait) {
				throw new AiProviderRateLimitedError(message);
			}

			this.logger.log(`Rate limited by the provider, retrying in ${Math.ceil(delayMs / MS_PER_SECOND)}s`);
			await this.sleep(delayMs + RATE_LIMIT_WAIT_MARGIN_MS);
		}
	}

	private runToolCalls(toolCalls: readonly GroqToolCall[], tools: readonly AiTool[]): Promise<readonly ToolRunOutcome[]> {
		return Promise.all(toolCalls.map((toolCall) => this.runTool(toolCall, tools)));
	}

	private async runTool(toolCall: GroqToolCall, tools: readonly AiTool[]): Promise<ToolRunOutcome> {
		const { name } = toolCall.function;
		const toMessage = (content: string): GroqMessage => ({ role: 'tool', tool_call_id: toolCall.id, name, content });

		try {
			const input = parseToolArguments(toolCall);

			if (name === RECORD_ANALYSIS_TOOL_NAME) {
				return { message: toMessage(RECORDED_RESULT), recorded: parseGeneratedAnalysis(input) };
			}

			const tool = tools.find((candidate) => candidate.name === name);

			if (!tool) {
				return { message: toMessage(`Error: unknown tool "${name}"`), recorded: null };
			}

			const content = await tool.run(input);

			return { message: toMessage(content), recorded: null };
		} catch (error) {
			this.logger.warn(`Tool ${name} failed: ${toErrorMessage(error)}`);

			return { message: toMessage(`Error: ${toErrorMessage(error)}`), recorded: null };
		}
	}
}

function sleepFor(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// How long the provider asked us to wait: the Retry-After header, else
// the "try again in 9.6s" in its message; null when it said neither.
function readRetryDelayMs(response: Response, message: string): number | null {
	const header = response.headers.get(RETRY_AFTER_HEADER);
	const headerSeconds = header === null ? Number.NaN : Number(header);

	if (Number.isFinite(headerSeconds)) {
		return headerSeconds * MS_PER_SECOND;
	}

	const match = RETRY_IN_SECONDS_PATTERN.exec(message);

	if (!match) {
		return null;
	}

	return Number(match[1]) * MS_PER_SECOND;
}

function toGroqTool(tool: AiTool): GroqTool {
	return { type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } };
}

function buildRecordAnalysisTool(): GroqTool {
	const description = 'Records your final, structured assessment. Call it exactly once, when the investigation is complete.';

	return { type: 'function', function: { name: RECORD_ANALYSIS_TOOL_NAME, description, parameters: RECORD_ANALYSIS_SCHEMA } };
}

function toGroqMessage(message: ConversationMessage): GroqMessage {
	return { role: message.role, content: message.content };
}

function toAssistantHistoryMessage(message: GroqAssistantMessage): GroqMessage {
	if (message.toolCalls.length === 0) {
		return { role: 'assistant', content: message.content ?? '' };
	}

	return { role: 'assistant', content: message.content, tool_calls: message.toolCalls };
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolCall(value: unknown): value is GroqToolCall {
	if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.function)) {
		return false;
	}

	return typeof value.function.name === 'string' && typeof value.function.arguments === 'string';
}

function parseAssistantMessage(body: unknown): GroqAssistantMessage {
	const choices = isRecord(body) ? body.choices : undefined;
	const firstChoice: unknown = Array.isArray(choices) ? choices[0] : undefined;
	const message = isRecord(firstChoice) ? firstChoice.message : undefined;

	if (!isRecord(message)) {
		throw new Error('The AI provider answered without a message');
	}

	const content = typeof message.content === 'string' ? message.content : null;
	const rawToolCalls: readonly unknown[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];

	return { content, toolCalls: rawToolCalls.filter(isToolCall) };
}

function parseToolArguments(toolCall: GroqToolCall): Record<string, unknown> {
	const parsed: unknown = toolCall.function.arguments.trim() === '' ? {} : JSON.parse(toolCall.function.arguments);

	if (!isRecord(parsed)) {
		throw new Error('Tool arguments must be a JSON object');
	}

	return parsed;
}

async function readProviderError(response: Response): Promise<string> {
	const body: unknown = await response.json().catch(() => null);
	const error = isRecord(body) ? body.error : undefined;
	const message = isRecord(error) && typeof error.message === 'string' ? error.message : response.statusText;

	return `AI provider answered ${response.status}: ${message}`;
}

async function toProviderError(response: Response): Promise<Error> {
	const message = await readProviderError(response);

	if (AUTH_REJECTED_STATUSES.has(response.status)) {
		return new AiProviderAuthError(message);
	}

	return new Error(message);
}
