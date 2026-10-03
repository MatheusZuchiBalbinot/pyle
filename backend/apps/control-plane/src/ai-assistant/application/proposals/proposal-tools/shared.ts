import { readBooleanInput, readNumberInput, type AiTool, type JsonSchemaProperty } from '../../../../ai-analysis/application/ai-tool.js';
import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import type { GatewayProposal } from '../../../../ai-analysis/domain/gateway-proposal.js';
import type { ConsumersService } from '../../../../gateway-config/application/consumers.service.js';
import type { RoutesService } from '../../../../gateway-config/application/routes.service.js';
import type { ServicesService } from '../../../../gateway-config/application/services.service.js';
import type { RouteDto } from '../../../../gateway-config/interface/dto/gateway-config-responses.js';
import type { AlertRuleConfigService } from '../../../../traffic/alerts/application/alert-rule-config.service.js';
import type { ProposalCollector } from '../../assistant-proposal.js';

// Common plumbing shared by every propose_* tool family: the dependencies
// every family receives, the Input/Outcome/ProposalSpec shapes, the generic
// input readers, and the recorder that turns a spec into an AiTool.

export type ProposalToolDependencies = {
	readonly services: ServicesService;
	readonly routes: RoutesService;
	readonly consumers: ConsumersService;
	readonly rules: AlertRuleConfigService;
	readonly isChaosAllowed: boolean;
	readonly isScalingAllowed: boolean;
	readonly collector: ProposalCollector;
};

export type Input = Readonly<Record<string, unknown>>;

// Either the proposal to record, or why there is nothing to propose.
export type Outcome = GatewayProposal | string;

export type ProposalSpec = {
	readonly name: string;
	readonly description: string;
	readonly properties: Readonly<Record<string, JsonSchemaProperty>>;
	readonly required: readonly string[];
	readonly build: (input: Input, reason: string) => Promise<Outcome>;
};

export const PROPOSAL_RECORDED = 'Proposal recorded. The operator will see a confirmation card for it; it has NOT been executed, do not say it was.';

const REASON: JsonSchemaProperty = {
	type: 'string',
	description: 'Why, in one sentence, in Brazilian Portuguese; shown to the operator on the card',
};

export const SERVICE_SLUG: JsonSchemaProperty = { type: 'string', description: 'Service slug, e.g. orders' };
export const INSTANCE_NAME: JsonSchemaProperty = { type: 'string', description: 'Instance name, e.g. orders-2' };
export const PATH_PREFIX: JsonSchemaProperty = { type: 'string', description: 'Route prefix, e.g. /api/orders' };

export function toTool(spec: ProposalSpec, collector: ProposalCollector): AiTool {
	return {
		name: spec.name,
		description: spec.description,
		inputSchema: {
			type: 'object',
			properties: { ...spec.properties, reason: REASON },
			required: [...spec.required, 'reason'],
			additionalProperties: false,
		},
		run: async (input) => {
			const outcome = await spec.build(input, readRequiredString(input, 'reason'));

			if (typeof outcome === 'string') {
				return `Not proposed: ${outcome}.`;
			}

			collector.add(outcome);

			return PROPOSAL_RECORDED;
		},
	};
}

export function readRequiredNumber(input: Input, key: string): number {
	const value = readNumberInput(input, key);

	if (value === undefined) {
		throw new Error(`${key} is required`);
	}

	return value;
}

// Absent means "remove the route's own setting" (fall back to the
// service's timeout, or no route limit).
export function readNullableNumber(input: Input, key: string): number | null {
	return readNumberInput(input, key) ?? null;
}

export function readFlag(input: Input, key: string): boolean {
	const value = readBooleanInput(input, key);

	if (value === undefined) {
		throw new Error(`${key} is required`);
	}

	return value;
}

export async function findRoute(routes: RoutesService, pathPrefix: string): Promise<RouteDto | string> {
	const all = await routes.list();

	return (
		all.find((route) => route.pathPrefix === pathPrefix) ??
		`no route has the prefix ${pathPrefix}; routes are ${all.map((route) => route.pathPrefix).join(', ')}`
	);
}
