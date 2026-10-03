import { BadRequestException, HttpException, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AiModelClient,
	AiNotConfiguredError,
	AiProviderRateLimitedError,
	type ConversationRequest,
	type ConversationResult,
} from '../../ai-analysis/application/ai-model-client.js';
import type { AiTool } from '../../ai-analysis/application/ai-tool.js';
import { AiAssistantService } from './ai-assistant.service.js';
import type { ProposalCollector } from './assistant-proposal.js';
import type { AssistantToolFactory } from './assistant-tools.factory.js';

const PROPOSAL = { type: 'generate_analysis', scope: 'platform', subjectId: null, subjectName: null, windowMinutes: null, reason: 'Pedido' } as const;

type FakeModelOptions = { readonly isConfigured?: boolean; readonly run?: (request: ConversationRequest) => Promise<ConversationResult> };

function buildFakeModel(options: FakeModelOptions): AiModelClient & { readonly requests: ConversationRequest[] } {
	const requests: ConversationRequest[] = [];
	const isConfigured = options.isConfigured ?? true;

	return {
		requests,
		getModelId: () => {
			if (!isConfigured) {
				throw new AiNotConfiguredError('AI_MODEL is missing');
			}

			return 'm';
		},
		runAnalysis: vi.fn(),
		streamReply: vi.fn(),
		runConversation: (request: ConversationRequest) => {
			requests.push(request);

			return options.run ? options.run(request) : Promise.resolve({ text: 'ok', toolCalls: [] });
		},
	} as unknown as AiModelClient & { readonly requests: ConversationRequest[] };
}

// A tool factory whose single tool records a proposal when run — the
// fake model below calls it the way the real adapters do.
function buildToolFactory(): AssistantToolFactory {
	const buildTools = (collector: ProposalCollector): readonly AiTool[] => [
		{
			name: 'propose_analysis',
			description: '',
			inputSchema: { type: 'object', properties: {}, required: [], additionalProperties: false },
			run: () => {
				collector.add(PROPOSAL);

				return Promise.resolve('recorded');
			},
		},
	];

	return { buildTools } as unknown as AssistantToolFactory;
}

const USER_TURN = { messages: [{ role: 'user' as const, content: 'Crie a Loja' }], timeZone: 'America/Sao_Paulo' };

describe('AiAssistantService', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('returns the reply with what the model proposed through the tools', async () => {
		const model = buildFakeModel({
			run: async (request) => {
				await request.tools[0].run({});

				return { text: 'Confirme o card.', toolCalls: ['propose_analysis'] };
			},
		});

		const reply = await new AiAssistantService(model, buildToolFactory()).respond(USER_TURN);

		expect(reply).toEqual({ reply: 'Confirme o card.', proposals: [PROPOSAL], toolCalls: ['propose_analysis'] });
	});

	it('sends the conversation with a system prompt carrying the clock and the operator’s time zone', async () => {
		vi.useFakeTimers({ now: new Date('2026-09-24T15:00:00.000Z'), toFake: ['Date'] });
		const model = buildFakeModel({});

		await new AiAssistantService(model, buildToolFactory()).respond(USER_TURN);

		const [request] = model.requests;

		expect(request.messages).toEqual(USER_TURN.messages);
		expect(request.systemPrompt).toContain('2026-09-24T12:00:00-03:00');
		expect(request.systemPrompt).toContain('America/Sao_Paulo');
	});

	it('refuses a conversation that does not end with the operator', async () => {
		const input = { ...USER_TURN, messages: [...USER_TURN.messages, { role: 'assistant' as const, content: 'Oi' }] };

		await expect(new AiAssistantService(buildFakeModel({}), buildToolFactory()).respond(input)).rejects.toThrow(BadRequestException);
	});

	it('answers 503 when AI is not configured, before calling the model', async () => {
		const model = buildFakeModel({ isConfigured: false });

		await expect(new AiAssistantService(model, buildToolFactory()).respond(USER_TURN)).rejects.toThrow(ServiceUnavailableException);
		expect(model.requests).toEqual([]);
	});

	it('turns a provider rate limit into a 429', async () => {
		const model = buildFakeModel({ run: () => Promise.reject(new AiProviderRateLimitedError('429 from provider')) });

		const promise = new AiAssistantService(model, buildToolFactory()).respond(USER_TURN);

		await expect(promise).rejects.toBeInstanceOf(HttpException);
		await expect(promise).rejects.toMatchObject({ status: HttpStatus.TOO_MANY_REQUESTS });
	});

	it('rethrows any other failure as is', async () => {
		const failure = new Error('network down');
		const model = buildFakeModel({ run: () => Promise.reject(failure) });

		await expect(new AiAssistantService(model, buildToolFactory()).respond(USER_TURN)).rejects.toBe(failure);
	});
});
