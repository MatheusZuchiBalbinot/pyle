import type { GatewayProposal } from '../../ai-analysis/domain/gateway-proposal.js';

export type AssistantProposal = GatewayProposal;

// A proposal repeated in the same turn (models do call a tool twice) is kept once.
export class ProposalCollector {
	private readonly proposals: AssistantProposal[] = [];

	add(proposal: AssistantProposal): void {
		const serialized = JSON.stringify(proposal);
		const isDuplicate = this.proposals.some((existing) => JSON.stringify(existing) === serialized);

		if (isDuplicate) {
			return;
		}

		this.proposals.push(proposal);
	}

	list(): readonly AssistantProposal[] {
		return [...this.proposals];
	}
}
