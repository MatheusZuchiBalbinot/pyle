import { BadRequestException, Injectable, Logger } from '@nestjs/common';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { assertAiConfigured, toAiHttpError } from '../../ai-analysis/application/ai-errors.js';
import { AiModelClient, type ConversationMessage, type ConversationRequest } from '../../ai-analysis/application/ai-model-client.js';
import { buildAssistantSystemPrompt, type AssistantPromptContext } from './assistant-prompt.js';
import { ProposalCollector, type AssistantProposal } from './assistant-proposal.js';
import { AssistantToolFactory } from './assistant-tools.factory.js';
import { withOperatorTimes } from './operator-time.js';

export type AssistantTurnInput = {
	readonly messages: readonly ConversationMessage[];
	readonly timeZone: string;
};

export type AssistantReply = {
	readonly reply: string;
	readonly proposals: readonly AssistantProposal[];
	readonly toolCalls: readonly string[];
};

// Stateless: the console sends the whole conversation each turn. Proposals come back typed;
// this service never acts on them.
@Injectable()
export class AiAssistantService {
	private readonly logger = new Logger(AiAssistantService.name);

	constructor(
		private readonly modelClient: AiModelClient,
		private readonly toolFactory: AssistantToolFactory,
	) {}

	async respond(input: AssistantTurnInput): Promise<AssistantReply> {
		const lastMessage = input.messages.at(-1);

		if (lastMessage?.role !== 'user') {
			throw new BadRequestException('The conversation must end with an operator message');
		}

		assertAiConfigured(this.modelClient);

		const collector = new ProposalCollector();
		const promptContext: AssistantPromptContext = { now: new Date(), timeZone: input.timeZone };
		const systemPrompt = buildAssistantSystemPrompt(promptContext);
		const tools = withOperatorTimes(this.toolFactory.buildTools(collector), input.timeZone);
		const request: ConversationRequest = { systemPrompt, messages: input.messages, tools };

		try {
			const result = await this.modelClient.runConversation(request);

			return { reply: result.text, proposals: collector.list(), toolCalls: result.toolCalls };
		} catch (error) {
			this.logger.error(`AI assistant turn failed: ${toErrorMessage(error)}`);
			throw toAiHttpError(error);
		}
	}
}
