import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminAuthGuard } from '../../auth/interface/admin-auth.guard.js';
import { ADMIN_BEARER_SCHEME_NAME } from '../../config/swagger-auth-schemes.js';
import { AiAssistantService, type AssistantReply, type AssistantTurnInput } from '../application/ai-assistant.service.js';
import { AssistantReplyDto } from './dto/assistant-reply.dto.js';
import { AssistantTurnDto } from './dto/assistant-turn.dto.js';
import { AssistantThrottlerGuard } from './assistant-throttler.guard.js';

const DEFAULT_TIME_ZONE = 'UTC';

@ApiTags('ai-assistant')
@ApiBearerAuth(ADMIN_BEARER_SCHEME_NAME)
@UseGuards(AdminAuthGuard, AssistantThrottlerGuard)
@Controller('admin/ai/assistant')
export class AiAssistantController {
	constructor(private readonly assistantService: AiAssistantService) {}

	@ApiOperation({
		summary:
			'One command-assistant turn: send the whole conversation, get the reply plus proposed actions to confirm (never executed server-side). Rate limited per operator.',
	})
	@ApiOkResponse({ type: AssistantReplyDto })
	@Post('messages')
	@HttpCode(HttpStatus.OK)
	respond(@Body() body: AssistantTurnDto): Promise<AssistantReply> {
		const input: AssistantTurnInput = { messages: body.messages, timeZone: body.timeZone ?? DEFAULT_TIME_ZONE };

		return this.assistantService.respond(input);
	}
}
