import { ApiProperty } from '@nestjs/swagger';

import { GATEWAY_PROPOSAL_LIST_SCHEMA } from '../../../ai-analysis/interface/dto/gateway-proposal-schema.js';
import type { AssistantReply } from '../../application/ai-assistant.service.js';
import type { AssistantProposal } from '../../application/assistant-proposal.js';

export class AssistantReplyDto implements AssistantReply {
	readonly reply!: string;
	// Proposed, never executed server-side: the console asks the operator to confirm.
	@ApiProperty(GATEWAY_PROPOSAL_LIST_SCHEMA)
	readonly proposals!: readonly AssistantProposal[];
	// The tools the model called this turn, in call order.
	@ApiProperty({ type: [String] })
	readonly toolCalls!: readonly string[];
}
