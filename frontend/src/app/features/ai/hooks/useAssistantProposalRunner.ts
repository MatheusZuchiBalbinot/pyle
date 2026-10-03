import { useCallback } from 'react';

import {
	createConsumer,
	createRoute,
	generateAiAnalysis,
	revokeApiKey,
	setInstanceChaos,
	setServiceReplicas,
	updateAlertRule,
	updateConsumer,
	updateInstance,
	updateRoute,
	updateService,
} from '@/app/api/adminApiClient';
import type {
	AssistantProposal,
	CreateConsumerInput,
	CreateRouteInput,
	GenerateAiAnalysisInput,
	UpdateAlertRuleConfigInput,
} from '@/app/api/adminApiTypes';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

export type ProposalRunResult =
	| { readonly kind: 'done' }
	| { readonly kind: 'consumer_created'; readonly consumerName: string; readonly apiKey: string }
	| { readonly kind: 'analysis_ready'; readonly analysisId: string };

export type UseAssistantProposalRunnerResult = {
	readonly execute: (proposal: AssistantProposal) => Promise<ProposalRunResult>;
};

const DONE: ProposalRunResult = { kind: 'done' };

// Through the same endpoints the forms use; pages refresh on the entity.changed those
// writes produce.
export function useAssistantProposalRunner(): UseAssistantProposalRunnerResult {
	const execute = useCallback((proposal: AssistantProposal) => runConfigProposal(proposal), []);

	return { execute };
}

function toGenerateInput(proposal: Extract<AssistantProposal, { type: 'generate_analysis' }>): GenerateAiAnalysisInput {
	const subjectId = proposal.subjectId ?? undefined;
	const windowMinutes = proposal.windowMinutes ?? undefined;

	return { scope: proposal.scope, subjectId, windowMinutes };
}

function toAlertRuleInput(proposal: Extract<AssistantProposal, { type: 'update_alert_rule' }>): UpdateAlertRuleConfigInput {
	return { isEnabled: proposal.isEnabled, threshold: proposal.threshold, sustainedWindows: proposal.sustainedWindows };
}

async function runConfigProposal(proposal: AssistantProposal): Promise<ProposalRunResult> {
	switch (proposal.type) {
		case 'drain_instance':
			await updateInstance(proposal.serviceSlug, proposal.instanceId, { isEnabled: false });

			return DONE;
		case 'enable_instance':
			await updateInstance(proposal.serviceSlug, proposal.instanceId, { isEnabled: true });

			return DONE;
		case 'set_instance_weight':
			await updateInstance(proposal.serviceSlug, proposal.instanceId, { weight: proposal.weight });

			return DONE;
		case 'set_lb_strategy':
			await updateService(proposal.serviceSlug, { lbStrategy: proposal.strategy });

			return DONE;
		case 'set_service_timeout':
			await updateService(proposal.serviceSlug, { timeoutMs: proposal.timeoutMs });

			return DONE;
		case 'set_service_retries':
			await updateService(proposal.serviceSlug, { retryMaxAttempts: proposal.retryMaxAttempts });

			return DONE;
		case 'set_route_timeout':
			await updateRoute(proposal.routeId, { timeoutMs: proposal.timeoutMs });

			return DONE;
		case 'set_route_rate_limit':
			await updateRoute(proposal.routeId, { rateLimitPerMinute: proposal.rateLimitPerMinute });

			return DONE;
		case 'set_consumer_rate_limit':
			await updateConsumer(proposal.consumerSlug, { rateLimitPerMinute: proposal.rateLimitPerMinute });

			return DONE;
		case 'revoke_api_key':
			await revokeApiKey(proposal.consumerSlug, proposal.keyId);

			return DONE;

		case 'create_consumer': {
			const input: CreateConsumerInput = { slug: proposal.slug, name: proposal.name, rateLimitPerMinute: proposal.rateLimitPerMinute };
			const created = await createConsumer(input);

			return { kind: 'consumer_created', consumerName: created.name, apiKey: created.key };
		}

		case 'create_route': {
			const input: CreateRouteInput = {
				name: proposal.name,
				pathPrefix: proposal.pathPrefix,
				serviceSlug: proposal.serviceSlug,
				isAuthRequired: proposal.isAuthRequired,
			};

			await createRoute(input);

			return DONE;
		}

		case 'update_alert_rule':
			await updateAlertRule(proposal.kind, toAlertRuleInput(proposal));

			return DONE;
		case 'set_instance_chaos':
			await setInstanceChaos(proposal.serviceSlug, proposal.instanceId, proposal.chaos);

			return DONE;
		case 'scale_service':
			await setServiceReplicas(proposal.serviceSlug, proposal.managedReplicas);

			return DONE;

		case 'generate_analysis': {
			const analysis = await generateAiAnalysis(toGenerateInput(proposal));

			return { kind: 'analysis_ready', analysisId: analysis.id };
		}

		default:
			return assertUnreachable(proposal);
	}
}
