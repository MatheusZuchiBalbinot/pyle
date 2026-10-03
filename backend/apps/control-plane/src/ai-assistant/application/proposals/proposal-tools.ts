import type { AiTool } from '../../../ai-analysis/application/ai-tool.js';
import { alertSpecs } from './proposal-tools/alert-tools.js';
import { consumerSpecs } from './proposal-tools/consumer-tools.js';
import { instanceSpecs } from './proposal-tools/instance-tools.js';
import { analysisSpecs, chaosSpec, scaleSpec } from './proposal-tools/operations-tools.js';
import { routeSpecs } from './proposal-tools/route-tools.js';
import { serviceSpecs } from './proposal-tools/service-tools.js';
import { PROPOSAL_RECORDED, toTool, type ProposalToolDependencies } from './proposal-tools/shared.js';

export { PROPOSAL_RECORDED, type ProposalToolDependencies };

// Every propose_* tool. Chaos and scaling are only offered where allowed: a
// tool the model cannot use is one it should not know about.
export function buildProposalTools(dependencies: ProposalToolDependencies): readonly AiTool[] {
	const specs = [
		...instanceSpecs(dependencies),
		...serviceSpecs(dependencies),
		...routeSpecs(dependencies),
		...consumerSpecs(dependencies),
		...alertSpecs(dependencies),
		...analysisSpecs(dependencies),
		...(dependencies.isChaosAllowed ? [chaosSpec(dependencies)] : []),
		...(dependencies.isScalingAllowed ? [scaleSpec(dependencies)] : []),
	];

	return specs.map((spec) => toTool(spec, dependencies.collector));
}
