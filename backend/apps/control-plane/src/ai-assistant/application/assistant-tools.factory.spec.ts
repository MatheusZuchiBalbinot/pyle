import { afterEach, describe, expect, it, vi } from 'vitest';

import { NO_INPUT_SCHEMA, type AiTool } from '../../ai-analysis/application/ai-tool.js';
import type { AnalysisToolFactory } from '../../ai-analysis/application/analysis-tools.factory.js';
import type { ConsumersService } from '../../gateway-config/application/consumers.service.js';
import type { RoutesService } from '../../gateway-config/application/routes.service.js';
import type { ServicesService } from '../../gateway-config/application/services.service.js';
import type { AlertRuleConfigService } from '../../traffic/alerts/application/alert-rule-config.service.js';
import { ProposalCollector } from './assistant-proposal.js';
import { AssistantToolFactory } from './assistant-tools.factory.js';

const READ_TOOL: AiTool = { name: 'get_system_health', description: 'health', inputSchema: NO_INPUT_SCHEMA, run: async () => '{}' };

function toolNames(): readonly string[] {
	const analysisToolFactory = { buildTools: () => [READ_TOOL] } as unknown as AnalysisToolFactory;
	const factory = new AssistantToolFactory(
		analysisToolFactory,
		{} as ServicesService,
		{} as RoutesService,
		{} as ConsumersService,
		{} as AlertRuleConfigService,
	);

	return factory.buildTools(new ProposalCollector()).map((tool) => tool.name);
}

describe('AssistantToolFactory', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('offers the analyses’ read tools and the proposal tools', () => {
		const names = toolNames();

		expect(names[0]).toBe('get_system_health');
		expect(names).toContain('propose_drain_instance');
		expect(names).toContain('propose_analysis');
	});

	it('offers chaos following the environment', () => {
		vi.stubEnv('CHAOS_ALLOWED', 'false');
		expect(toolNames()).not.toContain('propose_instance_chaos');

		vi.stubEnv('CHAOS_ALLOWED', 'true');
		vi.stubEnv('DEMO_CHAOS_TOKEN', 'x'.repeat(16));
		expect(toolNames()).toContain('propose_instance_chaos');
	});
});
