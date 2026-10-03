import { readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import type { ServiceDto } from '../../../../gateway-config/interface/dto/gateway-config-responses.js';
import { checkDrain, checkEnable, checkWeight, findInstance, RANGES } from '../validate-proposal.js';
import {
	INSTANCE_NAME,
	readRequiredNumber,
	SERVICE_SLUG,
	type Input,
	type Outcome,
	type ProposalSpec,
	type ProposalToolDependencies,
} from './shared.js';

export function instanceSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { services } = dependencies;

	const withInstance = async (input: Input, check: (service: ServiceDto, instance: ServiceDto['instances'][number]) => Outcome): Promise<Outcome> => {
		const service = await services.get(readRequiredString(input, 'serviceSlug'));
		const instance = findInstance(service, readRequiredString(input, 'instanceName'));

		return typeof instance === 'string' ? instance : check(service, instance);
	};

	const target = (service: ServiceDto, instance: ServiceDto['instances'][number]) => ({
		serviceSlug: service.slug,
		instanceId: instance.id,
		instanceName: instance.name,
	});

	return [
		{
			name: 'propose_drain_instance',
			description:
				'Proposes draining an instance: the gateway stops sending it new requests (in-flight ones finish). Reversible with propose_enable_instance.',
			properties: { serviceSlug: SERVICE_SLUG, instanceName: INSTANCE_NAME },
			required: ['serviceSlug', 'instanceName'],
			build: (input, reason) =>
				withInstance(input, (service, instance) => checkDrain(instance) ?? { type: 'drain_instance', ...target(service, instance), reason }),
		},
		{
			name: 'propose_enable_instance',
			description: 'Proposes enabling a drained instance again.',
			properties: { serviceSlug: SERVICE_SLUG, instanceName: INSTANCE_NAME },
			required: ['serviceSlug', 'instanceName'],
			build: (input, reason) =>
				withInstance(input, (service, instance) => checkEnable(instance) ?? { type: 'enable_instance', ...target(service, instance), reason }),
		},
		{
			name: 'propose_instance_weight',
			description: 'Proposes an instance weight (1-100); only matters when the service balances with weighted_random.',
			properties: {
				serviceSlug: SERVICE_SLUG,
				instanceName: INSTANCE_NAME,
				weight: { type: 'integer', minimum: RANGES.weight.min, maximum: RANGES.weight.max },
			},
			required: ['serviceSlug', 'instanceName', 'weight'],
			build: (input, reason) => {
				const weight = readRequiredNumber(input, 'weight');

				return withInstance(
					input,
					(service, instance) =>
						checkWeight(service, instance, weight) ?? { type: 'set_instance_weight', ...target(service, instance), weight, reason },
				);
			},
		},
	];
}
