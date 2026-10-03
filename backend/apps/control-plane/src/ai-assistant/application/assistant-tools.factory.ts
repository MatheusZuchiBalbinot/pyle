import { Injectable } from '@nestjs/common';

import type { AiTool } from '../../ai-analysis/application/ai-tool.js';
import { AnalysisToolFactory } from '../../ai-analysis/application/analysis-tools.factory.js';
import { getChaosConfig } from '../../config/chaos.js';
import { getScalingConfig } from '../../config/scaling.js';
import { ConsumersService } from '../../gateway-config/application/consumers.service.js';
import { RoutesService } from '../../gateway-config/application/routes.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { AlertRuleConfigService } from '../../traffic/alerts/application/alert-rule-config.service.js';
import { buildProposalTools, type ProposalToolDependencies } from './proposals/proposal-tools.js';
import type { ProposalCollector } from './assistant-proposal.js';

// A proposal tool checks the current state and answers why nothing was proposed when the
// change would fail or change nothing.
@Injectable()
export class AssistantToolFactory {
	constructor(
		private readonly analysisToolFactory: AnalysisToolFactory,
		private readonly services: ServicesService,
		private readonly routes: RoutesService,
		private readonly consumers: ConsumersService,
		private readonly rules: AlertRuleConfigService,
	) {}

	buildTools(collector: ProposalCollector): readonly AiTool[] {
		const { services, routes, consumers, rules } = this;
		const dependencies: ProposalToolDependencies = {
			services,
			routes,
			consumers,
			rules,
			isChaosAllowed: getChaosConfig().isAllowed,
			isScalingAllowed: getScalingConfig().isAllowed,
			collector,
		};

		return [...this.analysisToolFactory.buildTools(null), ...buildProposalTools(dependencies)];
	}
}
