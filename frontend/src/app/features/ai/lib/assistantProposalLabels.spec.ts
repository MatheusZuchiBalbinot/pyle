import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import type { AssistantProposal } from '@/app/api/adminApiTypes';
import { EVERY_PROPOSAL, PROPOSALS } from '@/test/proposalFixtures';

import { describeChaos, describeProposal, typedConfirmationFor } from './assistantProposalLabels';

// Returns the key plus its params, so an assertion shows both.
const t = ((key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key)) as unknown as TFunction;

describe('describeProposal', () => {
	it.each(EVERY_PROPOSAL)('describes $type with its own message', (proposal) => {
		expect(describeProposal(proposal, t)).toContain(`assistant.proposals.${proposal.type}`);
	});

	it.each<[AssistantProposal, string]>([
		[{ ...PROPOSALS.generate_analysis, subjectId: null, subjectName: null, scope: 'platform' }, 'assistant.proposals.generate_analysis_platform'],
		[{ ...PROPOSALS.create_route, isAuthRequired: false }, 'assistant.proposals.create_route_public'],
		[{ ...PROPOSALS.update_alert_rule, isEnabled: false }, 'assistant.proposals.update_alert_rule_disable'],
		[{ ...PROPOSALS.update_alert_rule, kind: 'circuit_open', threshold: null }, 'assistant.proposals.update_alert_rule_windows'],
		[PROPOSALS.set_route_timeout, 'assistant.proposals.serviceTimeout'],
		[{ ...PROPOSALS.set_route_timeout, timeoutMs: 1500 }, 'assistant.proposals.milliseconds'],
		[{ ...PROPOSALS.set_route_rate_limit, rateLimitPerMinute: null }, 'assistant.proposals.noLimit'],
		[PROPOSALS.set_route_rate_limit, 'assistant.proposals.perMinute'],
	])('picks the right variant for %o', (proposal, expectedKey) => {
		expect(describeProposal(proposal, t)).toContain(expectedKey);
	});
});

describe('describeChaos', () => {
	it.each([
		[{ latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: true }, ['assistant.chaos.down']],
		[
			{ latencyMs: 800, jitterMs: 200, errorRate: 0.3, isDown: false },
			['assistant.chaos.latency', 'assistant.chaos.jitter', 'assistant.chaos.errors'],
		],
		[{ latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false }, ['assistant.chaos.none']],
	])('describes %o', (chaos, expectedKeys) => {
		const description = describeChaos(chaos, t);

		for (const key of expectedKeys) {
			expect(description).toContain(key);
		}
	});

	it('shows the error rate as a whole percentage', () => {
		expect(describeChaos({ latencyMs: 0, jitterMs: 0, errorRate: 0.25, isDown: false }, t)).toContain('"percent":25');
	});
});

describe('typedConfirmationFor', () => {
	it('asks for the instance name before draining it', () => {
		expect(typedConfirmationFor(PROPOSALS.drain_instance)).toBe('orders-2');
	});

	it('asks for the key prefix before revoking it', () => {
		expect(typedConfirmationFor(PROPOSALS.revoke_api_key)).toBe('pyle_live_Ab');
	});

	it('asks for the instance name only when chaos takes it down', () => {
		expect(typedConfirmationFor(PROPOSALS.set_instance_chaos)).toBeNull();
		const takeDown: AssistantProposal = { ...PROPOSALS.set_instance_chaos, chaos: { ...PROPOSALS.set_instance_chaos.chaos, isDown: true } };

		expect(typedConfirmationFor(takeDown)).toBe('orders-2');
	});

	it('asks for the service slug only when scaling down', () => {
		expect(typedConfirmationFor(PROPOSALS.scale_service)).toBeNull();
		const scaleDown: AssistantProposal = { ...PROPOSALS.scale_service, managedReplicas: 0 };

		expect(typedConfirmationFor(scaleDown)).toBe('orders');
	});

	it('asks nothing for a harmless proposal', () => {
		expect(typedConfirmationFor(PROPOSALS.enable_instance)).toBeNull();
	});
});
