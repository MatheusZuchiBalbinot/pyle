import type { ApiPropertyOptions } from '@nestjs/swagger';

import { GATEWAY_PROPOSAL_TYPES } from '../../domain/gateway-proposal.js';

const PROPOSAL_TYPE_LIST = GATEWAY_PROPOSAL_TYPES.join(', ');

// GatewayProposal is a discriminated union the Swagger plugin cannot express:
// described, not typed. Shared by analysis suggested actions and assistant proposals.
export const GATEWAY_PROPOSAL_LIST_SCHEMA: ApiPropertyOptions = {
	description: `Actions for the operator to confirm, each discriminated by \`type\` (${PROPOSAL_TYPE_LIST}); every variant carries a reason`,
	type: 'object',
	isArray: true,
	additionalProperties: true,
};
