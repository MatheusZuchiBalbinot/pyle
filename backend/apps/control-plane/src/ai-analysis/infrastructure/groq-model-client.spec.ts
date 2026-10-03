import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AiNotConfiguredError,
	AiProviderAuthError,
	AiProviderRateLimitedError,
	type AnalysisRunRequest,
	type ConversationRequest,
	type ModelStreamEvent,
	type ReplyRequest,
} from '../application/ai-model-client.js';
import type { AiTool } from '../application/ai-tool.js';
import { RECORD_ANALYSIS_TOOL_NAME } from '../application/analysis-prompts.js';
import { GroqModelClient, type FetchFunction } from './groq-model-client.js';

type FakeToolCall = { readonly id: string; readonly name: string; readonly arguments: string };
type FakeTurn = { readonly content?: string | null; readonly toolCalls?: readonly FakeToolCall[] };
type RecordedRequest = { readonly url: string; readonly headers: Record<string, string>; readonly body: Record<string, unknown> };

const OK_STATUS = 200;

function toCompletion(turn: FakeTurn): unknown {
	const toolCalls = (turn.toolCalls ?? []).map((call) => ({
		id: call.id,
		type: 'function',
		function: { name: call.name, arguments: call.arguments },
	}));
	const message = { role: 'assistant', content: turn.content ?? null, ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}) };

	return { choices: [{ index: 0, message, finish_reason: toolCalls.length > 0 ? 'tool_calls' : 'stop' }] };
}

function jsonResponse(body: unknown, status = OK_STATUS): Response {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

// A fetch that plays back scripted completions (the last one repeats) and
// records every request body it got.
function buildFakeFetch(turns: readonly FakeTurn[]): { readonly fetchFunction: FetchFunction; readonly requests: RecordedRequest[] } {
	const requests: RecordedRequest[] = [];
	let turnIndex = 0;

	const fetchFunction: FetchFunction = (url, init) => {
		const body = JSON.parse(init.body as string) as Record<string, unknown>;

		requests.push({ url, headers: init.headers as Record<string, string>, body });
		const turn = turns[turnIndex] ?? turns[turns.length - 1];

		turnIndex += 1;

		return Promise.resolve(jsonResponse(toCompletion(turn)));
	};

	return { fetchFunction, requests };
}

const METRICS_TOOL: AiTool = {
	name: 'get_route_stats',
	description: 'metrics',
	inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
	run: vi.fn().mockResolvedValue('{"samples":[]}'),
};

const RECORDED = { summary: 'Tudo bem', riskLevel: 'low', highlights: ['CPU 1%'], recommendations: [] };

function buildRunRequest(): AnalysisRunRequest {
	return {
		scope: 'route',
		subject: { id: 'r1', name: 'Pedidos' },
		windowMinutes: 60,
		tools: [METRICS_TOOL],
		previousAnalysis: null,
		initialContext: null,
	};
}

function buildReplyRequest(): ReplyRequest {
	return {
		analysis: {
			summary: 'Tudo bem',
			riskLevel: 'low',
			highlights: [],
			recommendations: [],
			id: 'a1',
			scope: 'route',
			subjectId: 'r1',
			subjectName: 'Pedidos',
			windowMinutes: 60,
			suggestedActions: [],
			trend: null,
			trendSummary: null,
			previousAnalysisId: null,
			model: 'm',
			requestedAt: 'now',
		},
		history: [{ id: 'm1', role: 'user', content: 'Oi', createdAt: 'now' }],
		question: 'Por quê?',
		tools: [METRICS_TOOL],
	};
}

const CONVERSATION: ConversationRequest = {
	systemPrompt: 'sys',
	messages: [{ role: 'user', content: 'Drene a instância orders-2' }],
	tools: [METRICS_TOOL],
};

type SentMessage = { readonly role: string; readonly content: string | null; readonly tool_call_id?: string };

function sentMessages(request: RecordedRequest): readonly SentMessage[] {
	return request.body.messages as readonly SentMessage[];
}

async function collectReply(adapter: GroqModelClient, request: ReplyRequest): Promise<readonly ModelStreamEvent[]> {
	const events: ModelStreamEvent[] = [];

	for await (const event of adapter.streamReply(request)) {
		events.push(event);
	}

	return events;
}

describe('GroqModelClient', () => {
	beforeEach(() => {
		process.env.AI_MODEL = 'openai/gpt-oss-120b';
		process.env.AI_API_KEY = 'gsk-test';
	});
	afterEach(() => {
		delete process.env.AI_MODEL;
		delete process.env.AI_API_KEY;
		vi.clearAllMocks();
	});

	it('calls the OpenAI-compatible endpoint with the key, the model and the tools', async () => {
		const { fetchFunction, requests } = buildFakeFetch([{ content: 'Oi!' }]);

		await new GroqModelClient(fetchFunction).runConversation(CONVERSATION);

		expect(requests[0].url).toBe('https://api.groq.com/openai/v1/chat/completions');
		expect(requests[0].headers.Authorization).toBe('Bearer gsk-test');
		expect(requests[0].body.model).toBe('openai/gpt-oss-120b');
		expect(requests[0].body.tools).toEqual([
			{ type: 'function', function: { name: 'get_route_stats', description: 'metrics', parameters: METRICS_TOOL.inputSchema } },
		]);
		expect(sentMessages(requests[0])).toEqual([
			{ role: 'system', content: 'sys' },
			{ role: 'user', content: 'Drene a instância orders-2' },
		]);
	});

	describe('runAnalysis', () => {
		it('runs tools, feeds results back, and returns the recorded assessment', async () => {
			const { fetchFunction, requests } = buildFakeFetch([
				{ toolCalls: [{ id: 'c1', name: 'get_route_stats', arguments: '{"windowMinutes":120}' }] },
				{ toolCalls: [{ id: 'c2', name: RECORD_ANALYSIS_TOOL_NAME, arguments: JSON.stringify(RECORDED) }] },
			]);

			const generated = await new GroqModelClient(fetchFunction).runAnalysis(buildRunRequest());

			expect(generated).toEqual({ ...RECORDED, suggestedActions: [], trend: null, trendSummary: null });
			expect(METRICS_TOOL.run).toHaveBeenCalledWith({ windowMinutes: 120 });
			const secondTurn = sentMessages(requests[1]);

			expect(secondTurn.at(-1)).toEqual({ role: 'tool', tool_call_id: 'c1', name: 'get_route_stats', content: '{"samples":[]}' });
		});

		it('reports bad arguments, unknown tools and invalid records back to the model', async () => {
			const { fetchFunction, requests } = buildFakeFetch([
				{
					toolCalls: [
						{ id: 'c1', name: 'get_route_stats', arguments: '[1]' },
						{ id: 'c2', name: 'nope', arguments: '' },
						{ id: 'c3', name: RECORD_ANALYSIS_TOOL_NAME, arguments: '{"summary":""}' },
					],
				},
				{ toolCalls: [{ id: 'c4', name: RECORD_ANALYSIS_TOOL_NAME, arguments: JSON.stringify(RECORDED) }] },
			]);

			await new GroqModelClient(fetchFunction).runAnalysis(buildRunRequest());

			const toolResults = sentMessages(requests[1]).filter((message) => message.role === 'tool');

			expect(toolResults.map((message) => message.content)).toEqual([
				'Error: Tool arguments must be a JSON object',
				'Error: unknown tool "nope"',
				expect.stringContaining('Error: Tool call input is missing a non-empty "summary"'),
			]);
		});

		it('nudges when the model answers in prose, and fails if it never records', async () => {
			const { fetchFunction, requests } = buildFakeFetch([{ content: 'Parece ok.' }]);

			await expect(new GroqModelClient(fetchFunction).runAnalysis(buildRunRequest())).rejects.toThrow(/did not call/);
			expect(sentMessages(requests[1]).at(-1)?.content).toContain(RECORD_ANALYSIS_TOOL_NAME);
		});
	});

	describe('streamReply', () => {
		it('emits the tool calls, then the whole text and done', async () => {
			const { fetchFunction, requests } = buildFakeFetch([
				{ toolCalls: [{ id: 'c1', name: 'get_route_stats', arguments: '{}' }] },
				{ content: 'O risco é baixo.' },
			]);

			const events = await collectReply(new GroqModelClient(fetchFunction), buildReplyRequest());

			expect(events).toEqual([
				{ type: 'tool_call', name: 'get_route_stats' },
				{ type: 'text', delta: 'O risco é baixo.' },
				{ type: 'done', text: 'O risco é baixo.' },
			]);
			const roles = sentMessages(requests[0]).map((message) => message.role);

			expect(roles).toEqual(['system', 'user', 'assistant', 'user', 'user']);
		});

		it('ends with an empty done when the model keeps calling tools', async () => {
			const { fetchFunction } = buildFakeFetch([{ toolCalls: [{ id: 'c1', name: 'get_route_stats', arguments: '{}' }] }]);

			const events = await collectReply(new GroqModelClient(fetchFunction), buildReplyRequest());

			expect(events.at(-1)).toEqual({ type: 'done', text: '' });
		});
	});

	describe('runConversation', () => {
		it('returns the final text and the tools called along the way', async () => {
			const { fetchFunction } = buildFakeFetch([
				{ content: null, toolCalls: [{ id: 'c1', name: 'get_route_stats', arguments: '{}' }] },
				{ content: 'Proposta pronta.' },
			]);

			const result = await new GroqModelClient(fetchFunction).runConversation(CONVERSATION);

			expect(result).toEqual({ text: 'Proposta pronta.', toolCalls: ['get_route_stats'] });
		});

		it('treats a message with no content as empty text', async () => {
			const { fetchFunction } = buildFakeFetch([{ content: null }]);

			const result = await new GroqModelClient(fetchFunction).runConversation(CONVERSATION);

			expect(result.text).toBe('');
		});

		it('gives up after too many tool rounds', async () => {
			const { fetchFunction } = buildFakeFetch([{ toolCalls: [{ id: 'c1', name: 'get_route_stats', arguments: '{}' }] }]);

			await expect(new GroqModelClient(fetchFunction).runConversation(CONVERSATION)).rejects.toThrow(/did not answer/);
		});
	});

	describe('provider errors', () => {
		it('maps a 429 to AiProviderRateLimitedError with the provider message', async () => {
			const fetchFunction: FetchFunction = () => Promise.resolve(jsonResponse({ error: { message: 'Rate limit reached' } }, 429));

			const promise = new GroqModelClient(fetchFunction).runConversation(CONVERSATION);

			await expect(promise).rejects.toThrow(AiProviderRateLimitedError);
			await expect(promise).rejects.toThrow('AI provider answered 429: Rate limit reached');
		});

		it.each([401, 403])('maps a %i to AiProviderAuthError: the key is wrong or has no access', async (status) => {
			const fetchFunction: FetchFunction = () => Promise.resolve(jsonResponse({ error: { message: 'Invalid API Key' } }, status));

			await expect(new GroqModelClient(fetchFunction).runConversation(CONVERSATION)).rejects.toThrow(AiProviderAuthError);
		});

		it('fails with the status text when the error body is not JSON', async () => {
			const fetchFunction: FetchFunction = () => Promise.resolve(new Response('oops', { status: 500, statusText: 'Internal Server Error' }));

			await expect(new GroqModelClient(fetchFunction).runConversation(CONVERSATION)).rejects.toThrow(
				'AI provider answered 500: Internal Server Error',
			);
		});

		it('fails when the completion has no message', async () => {
			const fetchFunction: FetchFunction = () => Promise.resolve(jsonResponse({ choices: [] }));

			await expect(new GroqModelClient(fetchFunction).runConversation(CONVERSATION)).rejects.toThrow('without a message');
		});
	});

	describe('rate limit waits', () => {
		function rateLimited(message: string, headers: Record<string, string> = {}): Response {
			const body = JSON.stringify({ error: { message } });

			return new Response(body, { status: 429, headers: { 'Content-Type': 'application/json', ...headers } });
		}

		function scripted(responses: readonly Response[]): FetchFunction {
			let index = 0;

			return () => {
				const response = responses[Math.min(index, responses.length - 1)];

				index += 1;

				return Promise.resolve(response.clone());
			};
		}

		it.each([
			['the Retry-After header', rateLimited('slow down', { 'retry-after': '2' }), 2250],
			['the message', rateLimited('Rate limit reached. Please try again in 1.5s.'), 1750],
		])('waits as long as %s asks, then retries', async (_, limited, expectedWaitMs) => {
			const sleep = vi.fn().mockResolvedValue(undefined);
			const fetchFunction = scripted([limited, jsonResponse(toCompletion({ content: 'Oi' }))]);

			const result = await new GroqModelClient(fetchFunction, sleep).runConversation(CONVERSATION);

			expect(result.text).toBe('Oi');
			expect(sleep).toHaveBeenCalledWith(expectedWaitMs);
		});

		it('gives up at once when the wait asked for is too long', async () => {
			const sleep = vi.fn().mockResolvedValue(undefined);
			const fetchFunction = scripted([rateLimited('Please try again in 52.7s.')]);

			await expect(new GroqModelClient(fetchFunction, sleep).runConversation(CONVERSATION)).rejects.toThrow(AiProviderRateLimitedError);
			expect(sleep).not.toHaveBeenCalled();
		});

		it('gives up after a few retries', async () => {
			const sleep = vi.fn().mockResolvedValue(undefined);
			const fetchFunction = scripted([rateLimited('Please try again in 1s.')]);

			await expect(new GroqModelClient(fetchFunction, sleep).runConversation(CONVERSATION)).rejects.toThrow(AiProviderRateLimitedError);
			expect(sleep).toHaveBeenCalledTimes(3);
		});
	});

	describe('configuration', () => {
		it('is not configured without a model id', () => {
			delete process.env.AI_MODEL;

			expect(() => new GroqModelClient().getModelId()).toThrow(AiNotConfiguredError);
		});

		it('is not configured without an API key', async () => {
			delete process.env.AI_API_KEY;
			const { fetchFunction } = buildFakeFetch([{ content: 'Oi' }]);

			await expect(new GroqModelClient(fetchFunction).runConversation(CONVERSATION)).rejects.toThrow(AiNotConfiguredError);
		});
	});
});
