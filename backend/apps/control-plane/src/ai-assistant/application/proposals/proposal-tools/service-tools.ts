import { LOAD_BALANCING_STRATEGY_NAMES } from '@pyle/shared/contracts/config-snapshot.js';
import { isOneOf } from '@pyle/shared/contracts/names.js';

import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import { checkChanged, checkRange, checkStrategy, RANGES } from '../validate-proposal.js';
import { readRequiredNumber, SERVICE_SLUG, type ProposalSpec, type ProposalToolDependencies } from './shared.js';

export function serviceSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { services } = dependencies;

	return [
		{
			name: 'propose_lb_strategy',
			description:
				'Proposes changing how a service balances requests: round_robin, least_connections (fewest requests in flight; good when an instance is slow) or weighted_random.',
			properties: { serviceSlug: SERVICE_SLUG, strategy: { type: 'string', enum: LOAD_BALANCING_STRATEGY_NAMES } },
			required: ['serviceSlug', 'strategy'],
			build: async (input, reason) => {
				const strategy = readRequiredString(input, 'strategy');

				if (!isOneOf(LOAD_BALANCING_STRATEGY_NAMES, strategy)) {
					return `strategy must be one of ${LOAD_BALANCING_STRATEGY_NAMES.join(', ')}`;
				}

				const service = await services.get(readRequiredString(input, 'serviceSlug'));

				return checkStrategy(service, strategy) ?? { type: 'set_lb_strategy', serviceSlug: service.slug, strategy, reason };
			},
		},
		{
			name: 'propose_service_timeout',
			description: 'Proposes the per-attempt timeout of a service (100-60000 ms).',
			properties: {
				serviceSlug: SERVICE_SLUG,
				timeoutMs: { type: 'integer', minimum: RANGES.serviceTimeoutMs.min, maximum: RANGES.serviceTimeoutMs.max },
			},
			required: ['serviceSlug', 'timeoutMs'],
			build: async (input, reason) => {
				const timeoutMs = readRequiredNumber(input, 'timeoutMs');
				const service = await services.get(readRequiredString(input, 'serviceSlug'));
				const problem =
					checkRange('timeoutMs', timeoutMs, RANGES.serviceTimeoutMs) ?? checkChanged(`the timeout of ${service.slug}`, service.timeoutMs, timeoutMs);

				return problem ?? { type: 'set_service_timeout', serviceSlug: service.slug, timeoutMs, reason };
			},
		},
		{
			name: 'propose_service_retries',
			description: 'Proposes the total attempts of a service (1-5). Only GET, HEAD and OPTIONS without a body are ever retried, on another instance.',
			properties: {
				serviceSlug: SERVICE_SLUG,
				retryMaxAttempts: { type: 'integer', minimum: RANGES.retryMaxAttempts.min, maximum: RANGES.retryMaxAttempts.max },
			},
			required: ['serviceSlug', 'retryMaxAttempts'],
			build: async (input, reason) => {
				const retryMaxAttempts = readRequiredNumber(input, 'retryMaxAttempts');
				const service = await services.get(readRequiredString(input, 'serviceSlug'));
				const problem =
					checkRange('retryMaxAttempts', retryMaxAttempts, RANGES.retryMaxAttempts) ??
					checkChanged(`the attempts of ${service.slug}`, service.retryMaxAttempts, retryMaxAttempts);

				return problem ?? { type: 'set_service_retries', serviceSlug: service.slug, retryMaxAttempts, reason };
			},
		},
	];
}
