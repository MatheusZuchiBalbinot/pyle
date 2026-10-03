import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AssistantProposal } from '@/app/api/adminApiTypes';
import { buildConsoleHarness, type ConsoleHarness } from '@/test/consoleHarness';
import { PROPOSALS } from '@/test/proposalFixtures';

import type { ProposalOutcome } from './useAssistantChat';
import { useAssistantProposalCard } from './useAssistantProposalCard';

vi.mock('../../../api/adminApiClient', () => ({
	createConsumer: vi.fn(),
	createRoute: vi.fn(),
	generateAiAnalysis: vi.fn(),
	revokeApiKey: vi.fn(),
	setInstanceChaos: vi.fn(),
	setServiceReplicas: vi.fn(),
	updateAlertRule: vi.fn(),
	updateConsumer: vi.fn(),
	updateInstance: vi.fn(),
	updateRoute: vi.fn(),
	updateService: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const client = await import('../../../api/adminApiClient');

type Rendered = {
	readonly result: { readonly current: ReturnType<typeof useAssistantProposalCard> };
	readonly outcomes: ProposalOutcome[];
	readonly harness: ConsoleHarness;
};

function renderCard(proposal: AssistantProposal): Rendered {
	const outcomes: ProposalOutcome[] = [];
	const harness = buildConsoleHarness();

	const onOutcome = (outcome: ProposalOutcome): void => {
		outcomes.push(outcome);
	};

	const { result } = renderHook(() => useAssistantProposalCard(proposal, onOutcome), { wrapper: harness.wrapper });

	return { result, outcomes, harness };
}

async function confirm(rendered: Rendered): Promise<void> {
	await act(async () => {
		await rendered.result.current.confirm();
	});
}

describe('useAssistantProposalCard', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it.each<[AssistantProposal, () => unknown, readonly unknown[]]>([
		[PROPOSALS.enable_instance, () => client.updateInstance, ['orders', 'i2', { isEnabled: true }]],
		[PROPOSALS.set_instance_weight, () => client.updateInstance, ['catalog', 'c1', { weight: 3 }]],
		[PROPOSALS.set_lb_strategy, () => client.updateService, ['users', { lbStrategy: 'least_connections' }]],
		[PROPOSALS.set_service_timeout, () => client.updateService, ['orders', { timeoutMs: 2000 }]],
		[PROPOSALS.set_service_retries, () => client.updateService, ['orders', { retryMaxAttempts: 3 }]],
		[PROPOSALS.set_route_timeout, () => client.updateRoute, ['r1', { timeoutMs: null }]],
		[PROPOSALS.set_route_rate_limit, () => client.updateRoute, ['r1', { rateLimitPerMinute: 600 }]],
		[PROPOSALS.set_consumer_rate_limit, () => client.updateConsumer, ['partner-x', { rateLimitPerMinute: 240 }]],
		[PROPOSALS.create_route, () => client.createRoute, [{ name: 'Estoque', pathPrefix: '/api/stock', serviceSlug: 'catalog', isAuthRequired: true }]],
		[PROPOSALS.update_alert_rule, () => client.updateAlertRule, ['route_p95_latency', { isEnabled: true, threshold: 1200, sustainedWindows: 3 }]],
		[PROPOSALS.set_instance_chaos, () => client.setInstanceChaos, ['orders', 'i2', PROPOSALS.set_instance_chaos.chaos]],
		[PROPOSALS.scale_service, () => client.setServiceReplicas, ['orders', 3]],
	])('runs %o through the console endpoint, and nothing else', async (proposal, getCall, expectedArgs) => {
		const rendered = renderCard(proposal);

		await confirm(rendered);

		expect(getCall()).toHaveBeenCalledWith(...expectedArgs);
		expect(rendered.result.current.cardPhase).toEqual({ phase: 'done' });
		expect(rendered.outcomes).toEqual(['confirmed']);
	});

	it('creates the consumer and holds its key until acknowledged', async () => {
		vi.mocked(client.createConsumer).mockResolvedValue({ name: 'Loja', key: 'pyle_live_secret' } as never);
		const rendered = renderCard(PROPOSALS.create_consumer);

		await confirm(rendered);

		expect(client.createConsumer).toHaveBeenCalledWith({ slug: 'loja', name: 'Loja', rateLimitPerMinute: 600 });
		expect(rendered.result.current.cardPhase).toEqual({ phase: 'created', consumerName: 'Loja', apiKey: 'pyle_live_secret' });

		act(() => {
			rendered.result.current.acknowledgeApiKey();
		});

		expect(rendered.result.current.cardPhase).toEqual({ phase: 'done' });
	});

	it('will not drain until the instance name is typed', async () => {
		const rendered = renderCard(PROPOSALS.drain_instance);

		expect(rendered.result.current.isDestructive).toBe(true);
		expect(rendered.result.current.confirmationText).toBe('orders-2');

		await confirm(rendered);
		expect(client.updateInstance).not.toHaveBeenCalled();
		expect(rendered.result.current.canConfirm).toBe(false);

		act(() => {
			rendered.result.current.setTypedConfirmation('orders-2');
		});
		await confirm(rendered);

		expect(client.updateInstance).toHaveBeenCalledWith('orders', 'i2', { isEnabled: false });
	});

	it('revokes a key once its prefix is typed', async () => {
		const rendered = renderCard(PROPOSALS.revoke_api_key);

		act(() => {
			rendered.result.current.setTypedConfirmation('pyle_live_Ab');
		});
		await confirm(rendered);

		expect(client.revokeApiKey).toHaveBeenCalledWith('mobile-app', 'k1');
	});

	it('generates the analysis and opens it on request', async () => {
		vi.mocked(client.generateAiAnalysis).mockResolvedValue({ id: 'an1' } as never);
		const rendered = renderCard(PROPOSALS.generate_analysis);
		const openAnalysis = vi.spyOn(rendered.harness.value, 'openAnalysis');

		await confirm(rendered);
		act(() => {
			rendered.result.current.openCreatedAnalysis();
		});

		expect(client.generateAiAnalysis).toHaveBeenCalledWith({ scope: 'route', subjectId: 'r1', windowMinutes: 60 });
		expect(rendered.result.current.cardPhase).toEqual({ phase: 'analysis', analysisId: 'an1' });
		expect(openAnalysis).toHaveBeenCalledWith('an1');
	});

	it('generates a platform analysis without subject or window', async () => {
		vi.mocked(client.generateAiAnalysis).mockResolvedValue({ id: 'an2' } as never);
		const platform: AssistantProposal = {
			...PROPOSALS.generate_analysis,
			scope: 'platform',
			subjectId: null,
			subjectName: null,
			windowMinutes: null,
		};

		await confirm(renderCard(platform));

		expect(client.generateAiAnalysis).toHaveBeenCalledWith({ scope: 'platform', subjectId: undefined, windowMinutes: undefined });
	});

	it('does not open anything before an analysis exists', () => {
		const rendered = renderCard(PROPOSALS.generate_analysis);
		const openAnalysis = vi.spyOn(rendered.harness.value, 'openAnalysis');

		act(() => {
			rendered.result.current.openCreatedAnalysis();
		});

		expect(openAnalysis).not.toHaveBeenCalled();
	});

	it.each([
		[PROPOSALS.enable_instance, new client.AdminApiError('Instance not found', 404), 'Instance not found'],
		[PROPOSALS.generate_analysis, new client.AdminApiError('cooldown', 409), 'aiAnalysis.cooldown'],
		[PROPOSALS.enable_instance, new TypeError('network'), 'common.unexpectedError'],
	])('reports a failure with the message the operator can act on %#', async (proposal, error, message) => {
		vi.mocked(client.updateInstance).mockRejectedValue(error);
		vi.mocked(client.generateAiAnalysis).mockRejectedValue(error);
		const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
		const rendered = renderCard(proposal);

		await confirm(rendered);

		expect(rendered.result.current.cardPhase).toEqual({ phase: 'failed', message });
		expect(rendered.outcomes).toEqual(['failed']);
		consoleError.mockRestore();
	});

	it('records a dismissal without calling anything', () => {
		const rendered = renderCard(PROPOSALS.enable_instance);

		act(() => {
			rendered.result.current.dismiss();
		});

		expect(rendered.result.current.cardPhase).toEqual({ phase: 'dismissed' });
		expect(rendered.outcomes).toEqual(['dismissed']);
		expect(client.updateInstance).not.toHaveBeenCalled();
	});
});
