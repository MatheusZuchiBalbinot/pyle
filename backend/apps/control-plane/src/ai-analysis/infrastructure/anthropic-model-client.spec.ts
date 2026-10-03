import Anthropic from '@anthropic-ai/sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	AiNotConfiguredError,
	AiProviderAuthError,
	AiProviderRateLimitedError,
	type AnalysisRunRequest,
	type ModelStreamEvent,
	type ReplyRequest,
} from '../application/ai-model-client.js';
import type { AiTool } from '../application/ai-tool.js';
import { RECORD_ANALYSIS_TOOL_NAME } from '../application/analysis-prompts.js';
import { AnthropicModelClient } from './anthropic-model-client.js';

type FakeTurn = { readonly content: Anthropic.ContentBlock[]; readonly stop_reason?: Anthropic.Message['stop_reason'] };

function textBlock(text: string): Anthropic.TextBlock {
	return { type: 'text', text, citations: null };
}

function toolUseBlock(id: string, name: string, input: unknown): Anthropic.ToolUseBlock {
	return { type: 'tool_use', id, name, input, caller: { type: 'direct' } };
}

// Plays back scripted turns and records every request.
function buildFakeClient(turns: readonly FakeTurn[]) {
	const requests: Anthropic.MessageCreateParams[] = [];
	let turnIndex = 0;
	const stream = vi.fn((params: Anthropic.MessageCreateParams) => {
		// The adapter keeps appending to the same messages array; snapshot
		// it so each recorded request shows what that turn actually sent.
		requests.push({ ...params, messages: [...params.messages] });
		const turn = turns[turnIndex] ?? turns[turns.length - 1];

		turnIndex += 1;
		const message = { content: turn.content, stop_reason: turn.stop_reason ?? 'end_turn' } as Anthropic.Message;
		const events: Anthropic.MessageStreamEvent[] = turn.content.flatMap((block, index) => {
			if (block.type === 'text') {
				return [{ type: 'content_block_delta', index, delta: { type: 'text_delta', text: block.text } } as Anthropic.MessageStreamEvent];
			}

			if (block.type === 'tool_use') {
				return [{ type: 'content_block_start', index, content_block: block } as Anthropic.MessageStreamEvent];
			}

			return [];
		});

		return {
			[Symbol.asyncIterator]: async function* () {
				yield* events;
			},
			finalMessage: () => Promise.resolve(message),
		};
	});
	const client = { messages: { stream } } as unknown as Anthropic;

	return { client, requests };
}

const METRICS_TOOL: AiTool = {
	name: 'get_route_stats',
	description: 'metrics',
	inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
	run: vi.fn().mockResolvedValue('{"samples":[]}'),
};

const RECORDED = { summary: 'Tudo bem', riskLevel: 'low' as const, highlights: ['CPU 1%'], recommendations: [] };
// Mirrors MAX_REPLY_ITERATIONS in the adapter: the loop's own ceiling is
// not exported, so the spec states the number it is asserting against.
const MAX_REPLY_ITERATIONS = 6;

// A client that answers with a final message but emits no stream events —
// what the SDK does when the whole response arrives in one chunk.
function buildSilentClient(block: Anthropic.ContentBlock): Anthropic {
	const message = { content: [block], stop_reason: 'end_turn' } as Anthropic.Message;
	const stream = vi.fn(() => ({
		[Symbol.asyncIterator]: async function* (): AsyncGenerator<Anthropic.MessageStreamEvent> {
			// Nothing streamed on purpose.
		},
		finalMessage: () => Promise.resolve(message),
	}));

	return { messages: { stream } } as unknown as Anthropic;
}

function buildReplyRequest(): ReplyRequest {
	return {
		analysis: {
			...RECORDED,
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
		history: [],
		question: 'Por quê?',
		tools: [METRICS_TOOL],
	};
}

async function collectReply(adapter: AnthropicModelClient, request: ReplyRequest): Promise<readonly ModelStreamEvent[]> {
	const events: ModelStreamEvent[] = [];

	for await (const event of adapter.streamReply(request)) {
		events.push(event);
	}

	return events;
}

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

describe('AnthropicModelClient', () => {
	beforeEach(() => {
		process.env.AI_MODEL = 'test-model';
		process.env.AI_API_KEY = 'test-key';
	});
	afterEach(() => {
		delete process.env.AI_MODEL;
		delete process.env.AI_API_KEY;
		vi.clearAllMocks();
	});

	it('runs the tool loop: feeds tool results back, then returns the recorded assessment', async () => {
		const { client, requests } = buildFakeClient([
			{ content: [toolUseBlock('t1', 'get_route_stats', { windowMinutes: 120 })], stop_reason: 'tool_use' },
			{ content: [toolUseBlock('t2', RECORD_ANALYSIS_TOOL_NAME, RECORDED)], stop_reason: 'tool_use' },
		]);
		const adapter = new AnthropicModelClient(() => client);

		const generated = await adapter.runAnalysis(buildRunRequest());

		expect(generated).toEqual({ ...RECORDED, suggestedActions: [], trend: null, trendSummary: null });
		expect(METRICS_TOOL.run).toHaveBeenCalledWith({ windowMinutes: 120 });
		expect(requests).toHaveLength(2);
		const toolNames = (requests[0].tools ?? []).map((tool) => (tool as Anthropic.Tool).name);

		expect(toolNames).toEqual(['get_route_stats', RECORD_ANALYSIS_TOOL_NAME]);
		const secondTurnMessages = requests[1].messages;
		const lastUserContent = secondTurnMessages[secondTurnMessages.length - 1].content;

		expect(lastUserContent).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: '{"samples":[]}' }]);
	});

	it('reports a failing tool back to the model as an error result instead of aborting', async () => {
		const failingTool: AiTool = { ...METRICS_TOOL, run: vi.fn().mockRejectedValue(new Error('No route with id "x"')) };
		const { client, requests } = buildFakeClient([
			{ content: [toolUseBlock('t1', 'get_route_stats', {})], stop_reason: 'tool_use' },
			{ content: [toolUseBlock('t2', RECORD_ANALYSIS_TOOL_NAME, RECORDED)], stop_reason: 'tool_use' },
		]);
		const adapter = new AnthropicModelClient(() => client);

		await adapter.runAnalysis({ ...buildRunRequest(), tools: [failingTool] });

		const lastUserContent = requests[1].messages[requests[1].messages.length - 1].content;

		expect(lastUserContent).toEqual([{ type: 'tool_result', tool_use_id: 't1', content: 'No route with id "x"', is_error: true }]);
	});

	it('nudges once when the model answers in prose, and fails if it never records', async () => {
		const { client, requests } = buildFakeClient([{ content: [textBlock('Looks fine to me.')] }]);
		const adapter = new AnthropicModelClient(() => client);

		await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow(/did not call/);
		expect(requests.length).toBeGreaterThan(1);
		expect(JSON.stringify(requests[1].messages)).toContain(RECORD_ANALYSIS_TOOL_NAME);
	});

	it('streams a reply: tool call, text deltas, then done with the full text', async () => {
		const { client } = buildFakeClient([
			{ content: [toolUseBlock('t1', 'get_route_stats', {})], stop_reason: 'tool_use' },
			{ content: [textBlock('O risco é '), textBlock('baixo.')] },
		]);
		const adapter = new AnthropicModelClient(() => client);
		const request: ReplyRequest = {
			analysis: {
				...RECORDED,
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
			history: [],
			question: 'Por quê?',
			tools: [METRICS_TOOL],
		};

		const events = [];

		for await (const event of adapter.streamReply(request)) {
			events.push(event);
		}

		expect(events).toEqual([
			{ type: 'tool_call', name: 'get_route_stats' },
			{ type: 'text', delta: 'O risco é ' },
			{ type: 'text', delta: 'baixo.' },
			{ type: 'done', text: 'O risco é baixo.' },
		]);
	});

	describe('runConversation', () => {
		const CONVERSATION = { systemPrompt: 'sys', messages: [{ role: 'user' as const, content: 'Drene a instância orders-2' }], tools: [METRICS_TOOL] };

		it('runs tools until the model answers in text, and reports which tools it called', async () => {
			const { client, requests } = buildFakeClient([
				{ content: [toolUseBlock('t1', 'get_route_stats', {})], stop_reason: 'tool_use' },
				{ content: [textBlock('Pronto, '), textBlock('confirme o card.')] },
			]);
			const adapter = new AnthropicModelClient(() => client);

			const result = await adapter.runConversation(CONVERSATION);

			expect(result).toEqual({ text: 'Pronto, confirme o card.', toolCalls: ['get_route_stats'] });
			expect(requests[0].system).toBe('sys');
			expect(requests[0].messages).toEqual([{ role: 'user', content: 'Drene a instância orders-2' }]);
		});

		it('gives up after too many tool rounds', async () => {
			const { client } = buildFakeClient([{ content: [toolUseBlock('t1', 'get_route_stats', {})], stop_reason: 'tool_use' }]);
			const adapter = new AnthropicModelClient(() => client);

			await expect(adapter.runConversation(CONVERSATION)).rejects.toThrow(/did not answer/);
		});
	});

	it('is not configured without a model id', () => {
		delete process.env.AI_MODEL;
		expect(() => new AnthropicModelClient(() => buildFakeClient([]).client).getModelId()).toThrow();
	});

	it('is not configured without an API key either', async () => {
		delete process.env.AI_API_KEY;
		const adapter = new AnthropicModelClient(() => buildFakeClient([]).client);

		await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow(AiNotConfiguredError);
	});

	it('builds its SDK client once and reuses it across runs', async () => {
		const { client } = buildFakeClient([{ content: [toolUseBlock('t1', RECORD_ANALYSIS_TOOL_NAME, RECORDED)], stop_reason: 'tool_use' }]);
		const createClient = vi.fn(() => client);
		const adapter = new AnthropicModelClient(createClient);

		await adapter.runAnalysis(buildRunRequest());
		await adapter.runAnalysis(buildRunRequest());

		expect(createClient).toHaveBeenCalledTimes(1);
	});

	describe('provider errors', () => {
		function buildFailingClient(status: number): Anthropic {
			const error = Anthropic.APIError.generate(status, { type: 'error', error: { type: 'error' } }, 'refused', new Headers());
			const stream = vi.fn(() => {
				throw error;
			});

			return { messages: { stream } } as unknown as Anthropic;
		}

		it.each([401, 403])('turns a %i into AiProviderAuthError, on every entry point', async (status) => {
			const adapter = new AnthropicModelClient(() => buildFailingClient(status));
			const reply = adapter.streamReply(buildReplyRequest())[Symbol.asyncIterator]();

			await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow(AiProviderAuthError);
			await expect(reply.next()).rejects.toThrow(AiProviderAuthError);
		});

		it('turns a 429 into AiProviderRateLimitedError', async () => {
			const adapter = new AnthropicModelClient(() => buildFailingClient(429));

			await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow(AiProviderRateLimitedError);
		});

		it('lets any other failure through unchanged', async () => {
			const adapter = new AnthropicModelClient(() => buildFailingClient(500));

			await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow(Anthropic.InternalServerError);
		});
	});

	describe('refusals', () => {
		it('fails the analysis rather than recording a refusal as an assessment', async () => {
			const { client } = buildFakeClient([{ content: [textBlock('No.')], stop_reason: 'refusal' }]);
			const adapter = new AnthropicModelClient(() => client);

			await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow('The model declined to answer this request');
		});

		it('fails a reply the same way', async () => {
			const { client } = buildFakeClient([{ content: [textBlock('No.')], stop_reason: 'refusal' }]);
			const adapter = new AnthropicModelClient(() => client);

			await expect(collectReply(adapter, buildReplyRequest())).rejects.toThrow('The model declined to answer this request');
		});
	});

	describe('tool calls the model gets wrong', () => {
		it('tells the model a tool does not exist instead of failing the run', async () => {
			const { client, requests } = buildFakeClient([
				{ content: [toolUseBlock('t1', 'get_the_nuclear_codes', {})], stop_reason: 'tool_use' },
				{ content: [toolUseBlock('t2', RECORD_ANALYSIS_TOOL_NAME, RECORDED)], stop_reason: 'tool_use' },
			]);
			const adapter = new AnthropicModelClient(() => client);

			await adapter.runAnalysis(buildRunRequest());

			const toolResults = requests[1].messages.at(-1)?.content;

			expect(JSON.stringify(toolResults)).toContain('Unknown tool');
			expect(JSON.stringify(toolResults)).toContain('get_the_nuclear_codes');
		});

		it('passes an empty input to the tool when the model sends something that is not an object', async () => {
			const { client } = buildFakeClient([
				{ content: [toolUseBlock('t1', 'get_route_stats', 'not-an-object')], stop_reason: 'tool_use' },
				{ content: [toolUseBlock('t2', RECORD_ANALYSIS_TOOL_NAME, RECORDED)], stop_reason: 'tool_use' },
			]);
			const adapter = new AnthropicModelClient(() => client);

			await adapter.runAnalysis(buildRunRequest());

			expect(METRICS_TOOL.run).toHaveBeenCalledWith({});
		});
	});

	describe('reply loop limits', () => {
		it('ends the reply with what it has when the model keeps calling tools', async () => {
			const { client, requests } = buildFakeClient([
				{ content: [textBlock('Deixa eu ver. '), toolUseBlock('t1', 'get_route_stats', {})], stop_reason: 'tool_use' },
			]);
			const adapter = new AnthropicModelClient(() => client);

			const events = await collectReply(adapter, buildReplyRequest());

			expect(requests).toHaveLength(MAX_REPLY_ITERATIONS);
			expect(events.at(-1)).toEqual({ type: 'done', text: 'Deixa eu ver. '.repeat(MAX_REPLY_ITERATIONS) });
		});

		it('falls back to the message text when nothing was streamed', async () => {
			const silentClient = buildSilentClient(textBlock('Resposta completa.'));
			const adapter = new AnthropicModelClient(() => silentClient);

			const events = await collectReply(adapter, buildReplyRequest());

			expect(events).toEqual([{ type: 'done', text: 'Resposta completa.' }]);
		});
	});

	describe('the stream it hands the console', () => {
		it('forwards only text and tool calls, dropping the rest of the protocol', async () => {
			const message = { content: [textBlock('pronto')], stop_reason: 'end_turn' } as Anthropic.Message;
			const noise: Anthropic.MessageStreamEvent[] = [
				{ type: 'message_start', message } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"a"' } } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_start', index: 0, content_block: textBlock('') } as Anthropic.MessageStreamEvent,
				{ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'pronto' } } as Anthropic.MessageStreamEvent,
				{ type: 'message_stop' } as Anthropic.MessageStreamEvent,
			];
			const stream = vi.fn(() => ({
				[Symbol.asyncIterator]: async function* (): AsyncGenerator<Anthropic.MessageStreamEvent> {
					yield* noise;
				},
				finalMessage: () => Promise.resolve(message),
			}));
			const adapter = new AnthropicModelClient(() => ({ messages: { stream } }) as unknown as Anthropic);

			const events = await collectReply(adapter, buildReplyRequest());

			expect(events).toEqual([
				{ type: 'text', delta: 'pronto' },
				{ type: 'done', text: 'pronto' },
			]);
		});

		it('replays the thread so far, so a follow-up question has its context', async () => {
			const { client, requests } = buildFakeClient([{ content: [textBlock('porque sim')] }]);
			const adapter = new AnthropicModelClient(() => client);
			const request: ReplyRequest = {
				...buildReplyRequest(),
				history: [
					{ id: 'm1', role: 'user', content: 'a primeira pergunta', createdAt: 'now' },
					{ id: 'm2', role: 'assistant', content: 'a primeira resposta', createdAt: 'now' },
				],
			};

			await collectReply(adapter, request);

			const sent = JSON.stringify(requests[0].messages);

			expect(sent).toContain('a primeira pergunta');
			expect(sent).toContain('a primeira resposta');
		});
	});

	// Nothing in this spec exercises the real SDK path, so this is the one
	// assertion that the default really is an Anthropic client.
	it('builds a real SDK client when no factory was handed in', async () => {
		process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:1';
		const adapter = new AnthropicModelClient();

		await expect(adapter.runAnalysis(buildRunRequest())).rejects.toThrow();

		delete process.env.ANTHROPIC_BASE_URL;
	});
});
