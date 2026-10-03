import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { AiAnalysis, AiAnalysisScope } from '@prisma/control-plane-client';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { mapPage, type Page, type PageRequest } from '../../common/pagination.js';
import { RoutesService } from '../../gateway-config/application/routes.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { RealtimeEventBody } from '../../realtime/domain/realtime-event.js';
import { TRAFFIC_WINDOW_NAMES, type TrafficWindowName } from '../../traffic/domain/traffic-window.js';
import { isSubjectScope } from '../domain/analysis-scope.js';
import type { GeneratedAnalysis } from '../domain/parse-generated-analysis.js';
import {
	AiAnalysisRepository,
	type AiAnalysisSummary,
	type CreateAiAnalysisInput,
	type ListAnalysesFilter,
} from '../infrastructure/ai-analysis.repository.js';
import { toAiAnalysisDto, toAiAnalysisMessageDto, type AiAnalysisDto, type AiAnalysisMessageDto } from '../interface/dto/ai-analysis.dto.js';
import { assertAiConfigured, toAiHttpError } from './ai-errors.js';
import { AiModelClient, type AnalysisSubject, type ModelStreamEvent } from './ai-model-client.js';
import type { AiTool } from './ai-tool.js';
import { INITIAL_TOOL_BY_SCOPE } from './analysis-prompts.js';
import { AnalysisToolFactory } from './analysis-tools.factory.js';

const MS_PER_MINUTE = 60_000;
const DEFAULT_WINDOW_MINUTES = 60;
// Only stops double clicks from hammering the model; each button has its own cooldown.
const ANALYSIS_COOLDOWN_MS = 2 * MS_PER_MINUTE;
// Absorbs a double submit without a real conversation noticing.
const QUESTION_COOLDOWN_MS = 10_000;
const MAX_QUESTION_LENGTH = 2000;

export type ReplyStreamEvent = ModelStreamEvent | { readonly type: 'message'; readonly message: AiAnalysisMessageDto };

type ListAnalysesInput = {
	readonly scope?: AiAnalysisScope;
	readonly subjectId?: string;
};

type GenerateAnalysisInput = {
	readonly scope: AiAnalysisScope;
	// Route or service id; required unless the scope is platform.
	readonly subjectId?: string;
	readonly windowMinutes?: number;
};

const WINDOW_MINUTES: Readonly<Record<TrafficWindowName, number>> = { '15m': 15, '1h': 60, '6h': 360, '24h': 1440 };

@Injectable()
export class AiAnalysisService {
	private readonly logger = new Logger(AiAnalysisService.name);

	constructor(
		private readonly analysisRepository: AiAnalysisRepository,
		private readonly toolFactory: AnalysisToolFactory,
		private readonly modelClient: AiModelClient,
		private readonly realtimePublisher: RealtimePublisherService,
		private readonly routes: RoutesService,
		private readonly services: ServicesService,
	) {}

	async generate(input: GenerateAnalysisInput): Promise<AiAnalysisDto> {
		const subject = await this.resolveSubject(input);
		const previous = await this.analysisRepository.findLatest(input.scope, subject?.id ?? null);

		this.assertCooldownElapsed(previous);

		const windowMinutes = input.windowMinutes ?? DEFAULT_WINDOW_MINUTES;
		const generated = await this.runModel(input.scope, subject, windowMinutes, previous);

		const createInput: CreateAiAnalysisInput = {
			scope: input.scope,
			subjectId: subject?.id ?? null,
			subjectName: subject?.name ?? null,
			windowMinutes,
			model: this.modelClient.getModelId(),
			previousAnalysisId: previous?.id ?? null,
			...generated,
		};
		const analysis = await this.analysisRepository.create(createInput);
		const dto = toAiAnalysisDto(analysis);
		const readyEvent = toAnalysisReadyEvent(dto);

		await this.realtimePublisher.publishToAdmins(readyEvent);

		return dto;
	}

	async list(filter: ListAnalysesInput, page: PageRequest): Promise<Page<AiAnalysisDto>> {
		const repositoryFilter: ListAnalysesFilter = { scope: filter.scope, subjectId: filter.subjectId };
		const analyses = await this.analysisRepository.listPage(repositoryFilter, page);

		return mapPage(analyses, toAiAnalysisDto);
	}

	summarize(): Promise<AiAnalysisSummary> {
		return this.analysisRepository.summarize();
	}

	async getById(id: string): Promise<AiAnalysisDto> {
		return toAiAnalysisDto(await this.findAnalysisOrThrow(id));
	}

	async listMessages(analysisId: string): Promise<readonly AiAnalysisMessageDto[]> {
		await this.findAnalysisOrThrow(analysisId);
		const messages = await this.analysisRepository.listMessages(analysisId);

		return messages.map(toAiAnalysisMessageDto);
	}

	// The question is persisted before the model answers, so a dropped connection loses the
	// answer, never the question.
	async *reply(analysisId: string, question: string): AsyncIterable<ReplyStreamEvent> {
		const trimmed = question.trim();
		const isValidQuestion = trimmed.length > 0 && trimmed.length <= MAX_QUESTION_LENGTH;

		if (!isValidQuestion) {
			throw new BadRequestException(`question must be 1-${MAX_QUESTION_LENGTH} characters`);
		}

		const analysis = toAiAnalysisDto(await this.findAnalysisOrThrow(analysisId));
		const history = (await this.analysisRepository.listMessages(analysisId)).map(toAiAnalysisMessageDto);
		const subject: AnalysisSubject = analysis.subjectId ? { id: analysis.subjectId, name: analysis.subjectName ?? analysis.subjectId } : null;
		const tools = this.toolFactory.buildTools(subject);

		assertAiConfigured(this.modelClient);
		this.assertQuestionCooldownElapsed(history);

		await this.analysisRepository.addMessage(analysisId, 'user', trimmed);
		let answer = '';

		try {
			for await (const event of this.modelClient.streamReply({ analysis, history, question: trimmed, tools })) {
				if (event.type === 'done') {
					answer = event.text;
				}

				yield event;
			}
		} catch (error) {
			this.logger.error(`AI reply for analysis ${analysisId} failed: ${toErrorMessage(error)}`);
			throw toAiHttpError(error);
		}

		const saved = await this.analysisRepository.addMessage(analysisId, 'assistant', answer);

		yield { type: 'message', message: toAiAnalysisMessageDto(saved) };
	}

	// The subject's name is stored so history stays readable after a rename or delete.
	private async resolveSubject(input: GenerateAnalysisInput): Promise<AnalysisSubject> {
		if (!isSubjectScope(input.scope)) {
			return null;
		}

		const subjectId = input.subjectId;

		if (subjectId === undefined) {
			throw new BadRequestException(`A ${input.scope} analysis needs a subjectId`);
		}

		if (input.scope === 'route') {
			const routes = await this.routes.list();
			const route = routes.find((candidate) => candidate.id === subjectId);

			if (!route) {
				throw new NotFoundException(`Route "${subjectId}" not found`);
			}

			return { id: route.id, name: route.name, slug: null };
		}

		const services = await this.services.list();
		const service = services.find((candidate) => candidate.id === subjectId);

		if (!service) {
			throw new NotFoundException(`Service "${subjectId}" not found`);
		}

		return { id: service.id, name: service.name, slug: service.slug };
	}

	// Best effort: without it the model calls the tool itself.
	private async fetchInitialContext(
		scope: AiAnalysisScope,
		subject: AnalysisSubject,
		tools: readonly AiTool[],
		windowMinutes: number,
	): Promise<string | null> {
		const tool = tools.find((candidate) => candidate.name === INITIAL_TOOL_BY_SCOPE[scope]);

		if (!tool) {
			return null;
		}

		const input = initialToolInput(scope, subject, windowMinutes);

		try {
			return await tool.run(input);
		} catch (error) {
			this.logger.warn(`Could not prefetch ${tool.name}: ${toErrorMessage(error)}`);

			return null;
		}
	}

	private async runModel(
		scope: AiAnalysisScope,
		subject: AnalysisSubject,
		windowMinutes: number,
		previous: AiAnalysis | null,
	): Promise<GeneratedAnalysis> {
		assertAiConfigured(this.modelClient);
		const tools = this.toolFactory.buildTools(subject);
		const previousAnalysis = previous ? toAiAnalysisDto(previous) : null;
		const initialContext = await this.fetchInitialContext(scope, subject, tools, windowMinutes);

		try {
			return await this.modelClient.runAnalysis({ scope, subject, windowMinutes, tools, previousAnalysis, initialContext });
		} catch (error) {
			this.logger.error(`AI analysis (${scope}${subject ? ` ${subject.id}` : ''}) failed: ${toErrorMessage(error)}`);
			throw toAiHttpError(error);
		}
	}

	private assertCooldownElapsed(latest: AiAnalysis | null): void {
		if (!latest) {
			return;
		}

		const elapsedMs = Date.now() - latest.requestedAt.getTime();
		const isCooldownActive = elapsedMs < ANALYSIS_COOLDOWN_MS;

		if (!isCooldownActive) {
			return;
		}

		const retryAfterSeconds = Math.ceil((ANALYSIS_COOLDOWN_MS - elapsedMs) / 1000);

		throw new ConflictException(`An analysis of this scope was generated moments ago — try again in ${retryAfterSeconds}s`);
	}

	private assertQuestionCooldownElapsed(history: readonly AiAnalysisMessageDto[]): void {
		const lastQuestion = history.findLast((message) => message.role === 'user');

		if (!lastQuestion) {
			return;
		}

		const elapsedMs = Date.now() - Date.parse(lastQuestion.createdAt);

		if (elapsedMs >= QUESTION_COOLDOWN_MS) {
			return;
		}

		const retryAfterSeconds = Math.ceil((QUESTION_COOLDOWN_MS - elapsedMs) / 1000);

		throw new ConflictException(`A question about this analysis was asked moments ago — try again in ${retryAfterSeconds}s`);
	}

	private async findAnalysisOrThrow(id: string): Promise<AiAnalysis> {
		const analysis = await this.analysisRepository.findById(id);

		if (!analysis) {
			throw new NotFoundException(`Analysis "${id}" not found`);
		}

		return analysis;
	}
}

// The smallest named traffic window that covers the analysis window.
export function toolWindowFor(windowMinutes: number): TrafficWindowName {
	return TRAFFIC_WINDOW_NAMES.find((name) => WINDOW_MINUTES[name] >= windowMinutes) ?? '24h';
}

function initialToolInput(scope: AiAnalysisScope, subject: AnalysisSubject, windowMinutes: number): Readonly<Record<string, unknown>> {
	const window = toolWindowFor(windowMinutes);

	if (scope === 'route') {
		return { routeId: subject?.id, window };
	}

	if (scope === 'service') {
		return { serviceSlug: subject?.slug };
	}

	return { window };
}

function toAnalysisReadyEvent(dto: AiAnalysisDto): RealtimeEventBody {
	return {
		type: 'ai.analysis.ready',
		scope: dto.scope,
		subjectId: dto.subjectId,
		subjectName: dto.subjectName,
		analysisId: dto.id,
		riskLevel: dto.riskLevel,
	};
}
