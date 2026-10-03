import { GATEWAY_ALERT_KIND_NAMES, isOneOf } from '@pyle/shared/contracts/names.js';

import { readNumberInput } from '../../../../ai-analysis/application/ai-tool.js';
import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import { checkAlertRule } from '../validate-proposal.js';
import { readFlag, readRequiredNumber, type ProposalSpec, type ProposalToolDependencies } from './shared.js';

export function alertSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { rules } = dependencies;

	return [
		{
			name: 'propose_alert_rule',
			description:
				'Proposes the settings of one alert rule. Threshold: ms for route_p95_latency, percent for route_error_rate, none for the instance kinds.',
			properties: {
				kind: { type: 'string', enum: GATEWAY_ALERT_KIND_NAMES },
				isEnabled: { type: 'boolean' },
				threshold: { type: 'number' },
				sustainedWindows: { type: 'integer', minimum: 1, maximum: 30 },
			},
			required: ['kind', 'isEnabled', 'sustainedWindows'],
			build: async (input, reason) => {
				const kind = readRequiredString(input, 'kind');

				if (!isOneOf(GATEWAY_ALERT_KIND_NAMES, kind)) {
					return `kind must be one of ${GATEWAY_ALERT_KIND_NAMES.join(', ')}`;
				}

				const next = {
					isEnabled: readFlag(input, 'isEnabled'),
					threshold: readNumberInput(input, 'threshold') ?? null,
					sustainedWindows: readRequiredNumber(input, 'sustainedWindows'),
				};
				const current = (await rules.rules())[kind];

				return checkAlertRule(kind, current, next) ?? { type: 'update_alert_rule', kind, ...next, reason };
			},
		},
	];
}
