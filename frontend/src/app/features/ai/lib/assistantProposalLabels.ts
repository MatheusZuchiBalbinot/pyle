import type { TFunction } from 'i18next';

import type { AssistantProposal, ChaosState } from '@/app/api/adminApiTypes';
import { ALERT_KIND_LABEL_KEYS } from '@/app/lib/adminLabels';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

type Proposal<Type extends AssistantProposal['type']> = Extract<AssistantProposal, { type: Type }>;

const PERCENT_FACTOR = 100;

// Faults in the order they matter: down wins over everything else.
export function describeChaos(chaos: ChaosState, t: TFunction): string {
	if (chaos.isDown) {
		return t('assistant.chaos.down');
	}

	const parts: string[] = [];

	if (chaos.latencyMs > 0) {
		parts.push(t('assistant.chaos.latency', { ms: chaos.latencyMs }));
	}

	if (chaos.jitterMs > 0) {
		parts.push(t('assistant.chaos.jitter', { ms: chaos.jitterMs }));
	}

	if (chaos.errorRate > 0) {
		parts.push(t('assistant.chaos.errors', { percent: Math.round(chaos.errorRate * PERCENT_FACTOR) }));
	}

	if (parts.length === 0) {
		return t('assistant.chaos.none');
	}

	return parts.join(', ');
}

export function describeProposal(proposal: AssistantProposal, t: TFunction): string {
	switch (proposal.type) {
		case 'drain_instance':
			return t('assistant.proposals.drain_instance', { instance: proposal.instanceName });
		case 'enable_instance':
			return t('assistant.proposals.enable_instance', { instance: proposal.instanceName });
		case 'set_instance_weight':
			return t('assistant.proposals.set_instance_weight', { instance: proposal.instanceName, weight: proposal.weight });
		case 'set_lb_strategy':
			return t('assistant.proposals.set_lb_strategy', { service: proposal.serviceSlug, strategy: t(`gateway.strategy.${proposal.strategy}`) });
		case 'set_service_timeout':
			return t('assistant.proposals.set_service_timeout', { service: proposal.serviceSlug, ms: proposal.timeoutMs });
		case 'set_service_retries':
			return t('assistant.proposals.set_service_retries', { service: proposal.serviceSlug, count: proposal.retryMaxAttempts });
		case 'set_route_timeout':
			return t('assistant.proposals.set_route_timeout', { route: proposal.routeName, timeout: describeTimeout(proposal.timeoutMs, t) });
		case 'set_route_rate_limit':
			return t('assistant.proposals.set_route_rate_limit', { route: proposal.routeName, limit: describeLimit(proposal.rateLimitPerMinute, t) });
		case 'set_consumer_rate_limit':
			return t('assistant.proposals.set_consumer_rate_limit', {
				consumer: proposal.consumerName,
				limit: describeLimit(proposal.rateLimitPerMinute, t),
			});
		case 'revoke_api_key':
			return t('assistant.proposals.revoke_api_key', { prefix: proposal.keyPrefix, consumer: proposal.consumerSlug });
		case 'create_consumer':
			return t('assistant.proposals.create_consumer', {
				name: proposal.name,
				slug: proposal.slug,
				limit: describeLimit(proposal.rateLimitPerMinute, t),
			});

		case 'create_route': {
			const authKey = proposal.isAuthRequired ? 'assistant.proposals.create_route' : 'assistant.proposals.create_route_public';

			return t(authKey, { prefix: proposal.pathPrefix, service: proposal.serviceSlug });
		}

		case 'update_alert_rule':
			return describeAlertRuleProposal(proposal, t);
		case 'generate_analysis':
			return describeAnalysisProposal(proposal, t);
		case 'set_instance_chaos':
			return t('assistant.proposals.set_instance_chaos', { instance: proposal.instanceName, chaos: describeChaos(proposal.chaos, t) });
		case 'scale_service':
			return t('assistant.proposals.scale_service', {
				service: proposal.serviceName,
				count: proposal.managedReplicas,
				current: proposal.currentManagedReplicas,
			});
		default:
			return assertUnreachable(proposal);
	}
}

// Draining, revoking, taking an instance down and scaling down each need the target typed.
export function typedConfirmationFor(proposal: AssistantProposal): string | null {
	switch (proposal.type) {
		case 'drain_instance':
			return proposal.instanceName;
		case 'revoke_api_key':
			return proposal.keyPrefix;
		case 'set_instance_chaos':
			return proposal.chaos.isDown ? proposal.instanceName : null;
		case 'scale_service':
			return proposal.managedReplicas < proposal.currentManagedReplicas ? proposal.serviceSlug : null;
		default:
			return null;
	}
}

function describeAnalysisProposal(proposal: Proposal<'generate_analysis'>, t: TFunction): string {
	if (proposal.subjectName === null) {
		return t('assistant.proposals.generate_analysis_platform');
	}

	const scope = t(`aiAnalysis.scope.${proposal.scope}`);

	return t('assistant.proposals.generate_analysis', { scope, subject: proposal.subjectName });
}

function describeAlertRuleProposal(proposal: Proposal<'update_alert_rule'>, t: TFunction): string {
	const kind = t(ALERT_KIND_LABEL_KEYS[proposal.kind]);

	if (!proposal.isEnabled) {
		return t('assistant.proposals.update_alert_rule_disable', { kind });
	}

	if (proposal.threshold === null) {
		return t('assistant.proposals.update_alert_rule_windows', { kind, windows: proposal.sustainedWindows });
	}

	return t('assistant.proposals.update_alert_rule', { kind, threshold: proposal.threshold, windows: proposal.sustainedWindows });
}

function describeLimit(limit: number | null, t: TFunction): string {
	if (limit === null) {
		return t('assistant.proposals.noLimit');
	}

	return t('assistant.proposals.perMinute', { count: limit });
}

function describeTimeout(timeoutMs: number | null, t: TFunction): string {
	if (timeoutMs === null) {
		return t('assistant.proposals.serviceTimeout');
	}

	return t('assistant.proposals.milliseconds', { ms: timeoutMs });
}
