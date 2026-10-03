import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProduces, ApiTags, type ApiResponseOptions } from '@nestjs/swagger';
import type { Response } from 'express';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { UuidParamDto } from '../../common/dto/path-params.dto.js';
import { toPageRequest, type Page } from '../../common/pagination.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { AiAnalysisService, type ReplyStreamEvent } from '../application/ai-analysis.service.js';
import { AiAnalysisDto, AiAnalysisMessageDto, AiAnalysisPageDto, AiAnalysisSummaryDto } from './dto/ai-analysis.dto.js';
import { AskAnalysisDto } from './dto/ask-analysis.dto.js';
import { GenerateAnalysisDto, ListAnalysesQueryDto } from './dto/generate-analysis.dto.js';

// One event/data pair per model event. The console reads it with fetch (EventSource cannot
// send a POST body or a bearer token).
const SSE_HEADERS = {
	'Content-Type': 'text/event-stream',
	'Cache-Control': 'no-cache',
	Connection: 'keep-alive',
	'X-Accel-Buffering': 'no',
} as const;

// Each event's data is the JSON of the event itself, so the stream is one string.
const REPLY_STREAM_RESPONSE: ApiResponseOptions = {
	description: 'Server-sent events: `event: <type>` then `data: <JSON>`, for text, tool_call, done, message (the stored answer) and error',
	content: { 'text/event-stream': { schema: { type: 'string' } } },
};

@ApiTags('ai-analysis')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard)
@Controller('admin/ai/analyses')
export class AiAnalysisController {
	constructor(private readonly aiAnalysisService: AiAnalysisService) {}

	@ApiOperation({
		summary: 'Generate an AI analysis of the whole gateway, one route or one service (2-minute cooldown per scope and subject)',
	})
	@ApiCreatedResponse({ type: AiAnalysisDto })
	@Post()
	generate(@Body() body: GenerateAnalysisDto): Promise<AiAnalysisDto> {
		return this.aiAnalysisService.generate({ scope: body.scope, subjectId: body.subjectId, windowMinutes: body.windowMinutes });
	}

	@ApiOperation({ summary: 'A page of analyses, newest first, optionally filtered by scope and/or subject (cursor pagination)' })
	@ApiOkResponse({ type: AiAnalysisPageDto })
	@Get()
	list(@Query() query: ListAnalysesQueryDto): Promise<Page<AiAnalysisDto>> {
		return this.aiAnalysisService.list({ scope: query.scope, subjectId: query.subjectId }, toPageRequest(query));
	}

	// Declared before `:id`, which would otherwise take "summary" as an id.
	@ApiOperation({ summary: 'Totals across every analysis (count, distinct subjects, high-risk count)' })
	@ApiOkResponse({ type: AiAnalysisSummaryDto })
	@Get('summary')
	summarize(): Promise<AiAnalysisSummaryDto> {
		return this.aiAnalysisService.summarize();
	}

	@ApiOperation({ summary: 'Get one analysis' })
	@ApiOkResponse({ type: AiAnalysisDto })
	@Get(':id')
	getById(@Param() { id }: UuidParamDto): Promise<AiAnalysisDto> {
		return this.aiAnalysisService.getById(id);
	}

	@ApiOperation({ summary: 'The conversation about one analysis, oldest first' })
	@ApiOkResponse({ type: [AiAnalysisMessageDto] })
	@Get(':id/messages')
	listMessages(@Param() { id }: UuidParamDto): Promise<readonly AiAnalysisMessageDto[]> {
		return this.aiAnalysisService.listMessages(id);
	}

	@ApiOperation({
		summary: 'Ask a follow-up question about one analysis; the answer is streamed as server-sent events (text, tool_call, done, message, error)',
	})
	@ApiProduces('text/event-stream')
	@ApiOkResponse(REPLY_STREAM_RESPONSE)
	@Post(':id/messages')
	// Documents the 200 written below; @Res() sends the response itself.
	@HttpCode(HttpStatus.OK)
	async ask(@Param() { id }: UuidParamDto, @Body() body: AskAnalysisDto, @Res() response: Response): Promise<void> {
		// Validation errors (404, 400, 503) surface before the first event is
		// written, so they still arrive as ordinary JSON errors.
		const events = this.aiAnalysisService.reply(id, body.question);
		const iterator = events[Symbol.asyncIterator]();
		const first = await iterator.next();

		// Through setHeader, not writeHead's argument: the compression filter
		// reads the Content-Type off the response to leave the stream alone.
		for (const [name, value] of Object.entries(SSE_HEADERS)) {
			response.setHeader(name, value);
		}

		response.writeHead(HttpStatus.OK);

		try {
			if (!first.done) {
				writeSseEvent(response, first.value);
			}

			for (let next = await iterator.next(); !next.done; next = await iterator.next()) {
				writeSseEvent(response, next.value);
			}
		} catch (error) {
			// Mid-stream the status is already 200: the failure travels as
			// an event so the console can show it in the thread.
			writeSseEvent(response, { type: 'error', message: toErrorMessage(error) });
		} finally {
			response.end();
		}
	}
}

function writeSseEvent(response: Response, event: ReplyStreamEvent | { readonly type: 'error'; readonly message: string }): void {
	response.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}
