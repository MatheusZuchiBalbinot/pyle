import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AiAnalysis, AiAnalysisMessage } from '@prisma/control-plane-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PageRequest } from '../../common/pagination.js';
import type { RoutesService } from '../../gateway-config/application/routes.service.js';
import type { ServicesService } from '../../gateway-config/application/services.service.js';
import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import type { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { AiAnalysisRepository } from '../infrastructure/ai-analysis.repository.js';
import { AiAnalysisService, toolWindowFor } from './ai-analysis.service.js';
import { AiModelClient, AiNotConfiguredError, type ModelStreamEvent } from './ai-model-client.js';
import type { AnalysisToolFactory } from './analysis-tools.factory.js';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const COOLDOWN_MS = 2 * 60_000;
const MAX_QUESTION_LENGTH = 2000;
const PAGE: PageRequest = { cursor: null, limit: 50 };
const MODEL_ID = 'test-model';
const ROUTE_ID = 'route-1';

const GENERATED = {
	summary: 'Tudo bem',
	riskLevel: 'low' as const,
	highlights: ['CPU 1%'],
	recommendations: [],
	suggestedActions: [],
	trend: null,
	trendSummary: null,
};

function buildAnalysis(overrides: Partial<AiAnalysis> = {}): AiAnalysis {
	return {
		id: 'a1',
		scope: 'route',
		subjectId: ROUTE_ID,
		subjectName: 'Pedidos',
		windowMinutes: 60,
		...GENERATED,
		previousAnalysisId: null,
		model: MODEL_ID,
		requestedAt: new Date('2026-03-01T10:00:00.000Z'),
		...overrides,
	} as AiAnalysis;
}

function buildMessage(role: 'user' | 'assistant', content: string): AiAnalysisMessage {
	return { id: `m-${role}`, analysisId: 'a1', role, content, createdAt: NOW } as AiAnalysisMessage;
}

// Asked well before the cooldown window: the default history never blocks
// a new question.
const EARLIER_QUESTION = { ...buildMessage('user', 'por quê?'), createdAt: new Date(NOW.getTime() - 60_000) } as AiAnalysisMessage;

type Fakes = {
	readonly analysisRepository: AiAnalysisRepository;
	readonly toolFactory: AnalysisToolFactory;
	readonly modelClient: AiModelClient;
	readonly realtimePublisher: RealtimePublisherService;
	readonly routes: RoutesService;
	readonly services: ServicesService;
};

function buildFakes(): Fakes {
	const modelClient = {
		getModelId: vi.fn().mockReturnValue(MODEL_ID),
		runAnalysis: vi.fn().mockResolvedValue(GENERATED),
		streamReply: vi.fn().mockImplementation(async function* (): AsyncGenerator<ModelStreamEvent> {
			yield { type: 'text', delta: 'O risco é baixo.' };
			yield { type: 'done', text: 'O risco é baixo.' };
		}),
	} as unknown as AiModelClient;

	return {
		analysisRepository: {
			findLatest: vi.fn().mockResolvedValue(null),
			findById: vi.fn().mockResolvedValue(buildAnalysis()),
			create: vi.fn().mockResolvedValue(buildAnalysis()),
			listPage: vi.fn().mockResolvedValue({ items: [buildAnalysis()], nextCursor: null }),
			listMessages: vi.fn().mockResolvedValue([EARLIER_QUESTION]),
			addMessage: vi.fn().mockImplementation(async (_id: string, role: 'user' | 'assistant', content: string) => buildMessage(role, content)),
		} as unknown as AiAnalysisRepository,
		toolFactory: { buildTools: vi.fn().mockReturnValue([]) } as unknown as AnalysisToolFactory,
		modelClient,
		realtimePublisher: buildRealtimePublisherFake(),
		routes: { list: vi.fn().mockResolvedValue([{ id: ROUTE_ID, name: 'Pedidos' }]) } as unknown as RoutesService,
		services: { list: vi.fn().mockResolvedValue([{ id: 'service-1', name: 'Pedidos', slug: 'orders' }]) } as unknown as ServicesService,
	};
}

function buildService(fakes: Fakes): AiAnalysisService {
	return new AiAnalysisService(fakes.analysisRepository, fakes.toolFactory, fakes.modelClient, fakes.realtimePublisher, fakes.routes, fakes.services);
}

async function collectReply(service: AiAnalysisService, question: string): Promise<readonly unknown[]> {
	const events: unknown[] = [];

	for await (const event of service.reply('a1', question)) {
		events.push(event);
	}

	return events;
}

describe('AiAnalysisService', () => {
	let fakes: Fakes;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(NOW);
		fakes = buildFakes();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('generate', () => {
		it('runs the model against the whole gateway and stores what came back', async () => {
			const dto = await buildService(fakes).generate({ scope: 'platform' });

			expect(fakes.modelClient.runAnalysis).toHaveBeenCalledWith(expect.objectContaining({ scope: 'platform', subject: null, windowMinutes: 60 }));
			expect(fakes.analysisRepository.create).toHaveBeenCalledWith(
				expect.objectContaining({ scope: 'platform', subjectId: null, subjectName: null, model: MODEL_ID }),
			);
			expect(dto.id).toBe('a1');
		});

		it('announces the finished analysis to the console', async () => {
			await buildService(fakes).generate({ scope: 'platform' });

			expect(fakes.realtimePublisher.publishToAdmins).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'ai.analysis.ready', analysisId: 'a1', riskLevel: 'low', subjectId: ROUTE_ID }),
			);
		});

		it('honours a window the caller asked for', async () => {
			await buildService(fakes).generate({ scope: 'platform', windowMinutes: 360 });

			expect(fakes.modelClient.runAnalysis).toHaveBeenCalledWith(expect.objectContaining({ windowMinutes: 360 }));
		});

		it('chains the new analysis to the previous one, so the model can compare', async () => {
			fakes.analysisRepository.findLatest = vi.fn().mockResolvedValue(buildAnalysis({ id: 'a0', requestedAt: new Date('2026-01-01T00:00:00.000Z') }));

			await buildService(fakes).generate({ scope: 'platform' });

			expect(fakes.analysisRepository.findLatest).toHaveBeenCalledWith('platform', null);
			expect(fakes.analysisRepository.create).toHaveBeenCalledWith(expect.objectContaining({ previousAnalysisId: 'a0' }));
			expect(fakes.modelClient.runAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ previousAnalysis: expect.objectContaining({ id: 'a0' }) }),
			);
		});

		describe('the cooldown', () => {
			it('refuses a second manual run moments after the first, saying when to retry', async () => {
				const secondsAgo = 30;

				fakes.analysisRepository.findLatest = vi.fn().mockResolvedValue(buildAnalysis({ requestedAt: new Date(NOW.getTime() - secondsAgo * 1000) }));

				await expect(buildService(fakes).generate({ scope: 'platform' })).rejects.toThrow(
					`An analysis of this scope was generated moments ago — try again in ${COOLDOWN_MS / 1000 - secondsAgo}s`,
				);
			});

			it('allows it once the cooldown elapsed', async () => {
				fakes.analysisRepository.findLatest = vi.fn().mockResolvedValue(buildAnalysis({ requestedAt: new Date(NOW.getTime() - COOLDOWN_MS - 1) }));

				await expect(buildService(fakes).generate({ scope: 'platform' })).resolves.toBeDefined();
			});
		});

		it('answers "not configured" rather than a generic failure when there is no model', async () => {
			fakes.modelClient.getModelId = vi.fn().mockImplementation(() => {
				throw new AiNotConfiguredError('AI_MODEL is missing');
			});

			await expect(buildService(fakes).generate({ scope: 'platform' })).rejects.toThrow(ServiceUnavailableException);
		});

		it('lets an unexpected configuration failure surface as it is', async () => {
			fakes.modelClient.getModelId = vi.fn().mockImplementation(() => {
				throw new TypeError('something else entirely');
			});

			await expect(buildService(fakes).generate({ scope: 'platform' })).rejects.toThrow(TypeError);
		});

		it('surfaces a model failure instead of storing a half-built analysis', async () => {
			fakes.modelClient.runAnalysis = vi.fn().mockRejectedValue(new Error('model timed out'));

			await expect(buildService(fakes).generate({ scope: 'platform' })).rejects.toThrow('model timed out');
			expect(fakes.analysisRepository.create).not.toHaveBeenCalled();
		});
	});

	describe('reads', () => {
		it('maps a page of analyses to DTOs', async () => {
			const page = await buildService(fakes).list({}, PAGE);

			expect(page.items[0]).toEqual(expect.objectContaining({ id: 'a1', subjectId: ROUTE_ID, subjectName: 'Pedidos' }));
			expect(fakes.analysisRepository.listPage).toHaveBeenCalledWith({ scope: undefined, subjectId: undefined }, PAGE);
		});

		it('narrows the list to one subject', async () => {
			await buildService(fakes).list({ scope: 'route', subjectId: ROUTE_ID }, PAGE);

			expect(fakes.analysisRepository.listPage).toHaveBeenCalledWith({ scope: 'route', subjectId: ROUTE_ID }, PAGE);
		});

		it('returns one analysis by id', async () => {
			expect((await buildService(fakes).getById('a1')).id).toBe('a1');
		});

		it('raises a not-found for an unknown analysis', async () => {
			fakes.analysisRepository.findById = vi.fn().mockResolvedValue(null);

			await expect(buildService(fakes).getById('ghost')).rejects.toThrow(NotFoundException);
		});

		it('returns the thread of one analysis', async () => {
			const messages = await buildService(fakes).listMessages('a1');

			expect(messages).toEqual([expect.objectContaining({ role: 'user', content: 'por quê?' })]);
		});

		it('raises a not-found for the thread of an unknown analysis', async () => {
			fakes.analysisRepository.findById = vi.fn().mockResolvedValue(null);

			await expect(buildService(fakes).listMessages('ghost')).rejects.toThrow(NotFoundException);
		});
	});

	describe('reply', () => {
		it('persists the question before the model answers, then the answer', async () => {
			const events = await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.analysisRepository.addMessage).toHaveBeenNthCalledWith(1, 'a1', 'user', 'por quê?');
			expect(fakes.analysisRepository.addMessage).toHaveBeenNthCalledWith(2, 'a1', 'assistant', 'O risco é baixo.');
			expect(events.at(-1)).toEqual({ type: 'message', message: expect.objectContaining({ role: 'assistant' }) });
		});

		it('streams the model events through on the way', async () => {
			const events = await collectReply(buildService(fakes), 'por quê?');

			expect(events[0]).toEqual({ type: 'text', delta: 'O risco é baixo.' });
		});

		it('binds the tools to the analysis subject, so a reply stays on it', async () => {
			await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.toolFactory.buildTools).toHaveBeenCalledWith({ id: ROUTE_ID, name: 'Pedidos' });
		});

		it('falls back to the id when the subject name was not recorded', async () => {
			fakes.analysisRepository.findById = vi.fn().mockResolvedValue(buildAnalysis({ subjectName: null }));

			await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.toolFactory.buildTools).toHaveBeenCalledWith({ id: ROUTE_ID, name: ROUTE_ID });
		});

		it('binds no subject for a platform analysis', async () => {
			fakes.analysisRepository.findById = vi.fn().mockResolvedValue(buildAnalysis({ scope: 'platform', subjectId: null, subjectName: null }));

			await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.toolFactory.buildTools).toHaveBeenCalledWith(null);
		});

		it('refuses a new question moments after the previous one, before calling the model', async () => {
			const justAsked = { ...buildMessage('user', 'e agora?'), createdAt: new Date(NOW.getTime() - 3_000) } as AiAnalysisMessage;

			fakes.analysisRepository.listMessages = vi.fn().mockResolvedValue([justAsked]);

			await expect(collectReply(buildService(fakes), 'e de novo?')).rejects.toThrow(/try again in \d+s/);
			expect(fakes.analysisRepository.addMessage).not.toHaveBeenCalled();
		});

		it('accepts the first question of a conversation', async () => {
			fakes.analysisRepository.listMessages = vi.fn().mockResolvedValue([]);

			await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.analysisRepository.addMessage).toHaveBeenNthCalledWith(1, 'a1', 'user', 'por quê?');
		});

		it('refuses an empty question', async () => {
			await expect(collectReply(buildService(fakes), '   ')).rejects.toThrow(BadRequestException);
			expect(fakes.analysisRepository.addMessage).not.toHaveBeenCalled();
		});

		it('refuses a question longer than the limit', async () => {
			await expect(collectReply(buildService(fakes), 'a'.repeat(MAX_QUESTION_LENGTH + 1))).rejects.toThrow(
				`question must be 1-${MAX_QUESTION_LENGTH} characters`,
			);
		});

		it('trims the question before storing it', async () => {
			await collectReply(buildService(fakes), '  por quê?  ');

			expect(fakes.analysisRepository.addMessage).toHaveBeenNthCalledWith(1, 'a1', 'user', 'por quê?');
		});

		it('refuses to answer about an analysis that does not exist', async () => {
			fakes.analysisRepository.findById = vi.fn().mockResolvedValue(null);

			await expect(collectReply(buildService(fakes), 'por quê?')).rejects.toThrow(NotFoundException);
		});

		it('answers "not configured" when there is no model behind it', async () => {
			fakes.modelClient.getModelId = vi.fn().mockImplementation(() => {
				throw new AiNotConfiguredError('AI_MODEL is missing');
			});

			await expect(collectReply(buildService(fakes), 'por quê?')).rejects.toThrow(ServiceUnavailableException);
			expect(fakes.analysisRepository.addMessage).not.toHaveBeenCalled();
		});

		it('surfaces a failed stream, leaving the question stored and no answer', async () => {
			fakes.modelClient.streamReply = vi.fn().mockImplementation(async function* (): AsyncGenerator<ModelStreamEvent> {
				yield { type: 'text', delta: 'começando' };
				throw new Error('model connection dropped');
			});

			await expect(collectReply(buildService(fakes), 'por quê?')).rejects.toThrow('model connection dropped');
			expect(fakes.analysisRepository.addMessage).toHaveBeenCalledTimes(1);
		});

		it('stores an empty answer when the stream ended without one, rather than nothing at all', async () => {
			fakes.modelClient.streamReply = vi.fn().mockImplementation(async function* (): AsyncGenerator<ModelStreamEvent> {
				yield { type: 'tool_call', name: 'get_route_stats' };
			});

			await collectReply(buildService(fakes), 'por quê?');

			expect(fakes.analysisRepository.addMessage).toHaveBeenNthCalledWith(2, 'a1', 'assistant', '');
		});
	});

	it('does not trip its own cooldown check when nothing was ever generated', async () => {
		fakes.analysisRepository.findLatest = vi.fn().mockResolvedValue(null);

		await expect(buildService(fakes).generate({ scope: 'platform' })).resolves.toBeDefined();
	});

	it('exposes ConflictException for the cooldown, which the console maps to its own message', async () => {
		fakes.analysisRepository.findLatest = vi.fn().mockResolvedValue(buildAnalysis({ requestedAt: NOW }));

		await expect(buildService(fakes).generate({ scope: 'platform' })).rejects.toBeInstanceOf(ConflictException);
	});

	describe('route and service analyses', () => {
		it('analyzes an existing route, naming it and prefetching its stats', async () => {
			const statsTool = { name: 'get_route_stats', description: '', inputSchema: {}, run: vi.fn().mockResolvedValue('{"route":"stats"}') };

			vi.mocked(fakes.toolFactory.buildTools).mockReturnValue([statsTool] as never);

			await buildService(fakes).generate({ scope: 'route', subjectId: ROUTE_ID, windowMinutes: 30 });

			expect(statsTool.run).toHaveBeenCalledWith({ routeId: ROUTE_ID, window: '1h' });
			expect(fakes.modelClient.runAnalysis).toHaveBeenCalledWith(
				expect.objectContaining({ subject: { id: ROUTE_ID, name: 'Pedidos', slug: null }, initialContext: '{"route":"stats"}' }),
			);
			expect(fakes.analysisRepository.create).toHaveBeenCalledWith(expect.objectContaining({ subjectId: ROUTE_ID, subjectName: 'Pedidos' }));
		});

		it('analyzes a service by id, prefetching its instances by slug, and goes on without the prefetch', async () => {
			const instancesTool = { name: 'get_service_instances', description: '', inputSchema: {}, run: vi.fn().mockRejectedValue(new Error('down')) };

			vi.mocked(fakes.toolFactory.buildTools).mockReturnValue([instancesTool] as never);

			await buildService(fakes).generate({ scope: 'service', subjectId: 'service-1' });

			expect(instancesTool.run).toHaveBeenCalledWith({ serviceSlug: 'orders' });
			expect(fakes.modelClient.runAnalysis).toHaveBeenCalledWith(expect.objectContaining({ initialContext: null }));
		});

		it('needs a subject that exists', async () => {
			const service = buildService(fakes);

			await expect(service.generate({ scope: 'route' })).rejects.toThrow(BadRequestException);
			await expect(service.generate({ scope: 'route', subjectId: 'nope' })).rejects.toThrow(NotFoundException);
			await expect(service.generate({ scope: 'service', subjectId: 'nope' })).rejects.toThrow(NotFoundException);
		});

		it('picks the smallest traffic window covering the analysis', () => {
			expect([10, 15, 60, 61, 360, 2000].map(toolWindowFor)).toEqual(['15m', '15m', '1h', '6h', '6h', '24h']);
		});
	});
});
