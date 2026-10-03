import { isOneOf } from '@pyle/shared/contracts/names.js';

import { readNumberInput } from '../../../../ai-analysis/application/ai-tool.js';
import { readOptionalString, readRequiredString } from '../../../../ai-analysis/application/tools/tool-inputs.js';
import { ANALYSIS_SCOPES } from '../../../../ai-analysis/domain/analysis-scope.js';
import { MAX_MANAGED_REPLICAS } from '../../../../scaling/domain/scaling-limits.js';
import { checkChanged, checkChaos, checkOptionalRange, checkRange, checkScalable, findInstance, RANGES } from '../validate-proposal.js';
import { findRoute, INSTANCE_NAME, readFlag, readRequiredNumber, SERVICE_SLUG, type ProposalSpec, type ProposalToolDependencies } from './shared.js';

// Scaling, chaos and ad-hoc analysis: operator-facing experiments and
// reports, as opposed to steady-state config (services, routes, consumers).

export function analysisSpecs(dependencies: ProposalToolDependencies): readonly ProposalSpec[] {
	const { routes, services } = dependencies;

	return [
		{
			name: 'propose_analysis',
			description:
				'Proposes a formal, saved AI analysis (Análises IA page) of the whole gateway, one route (by prefix) or one service (by slug), over a window ending now.',
			properties: {
				scope: { type: 'string', enum: ANALYSIS_SCOPES },
				pathPrefix: { type: 'string', description: 'For scope route' },
				serviceSlug: { type: 'string', description: 'For scope service' },
				windowMinutes: { type: 'integer', minimum: RANGES.windowMinutes.min, maximum: RANGES.windowMinutes.max },
			},
			required: ['scope'],
			build: async (input, reason) => {
				const scope = readRequiredString(input, 'scope');

				if (!isOneOf(ANALYSIS_SCOPES, scope)) {
					return `scope must be one of ${ANALYSIS_SCOPES.join(', ')}`;
				}

				const requestedWindow = readNumberInput(input, 'windowMinutes');
				const windowMinutes = requestedWindow === undefined ? null : Math.round(requestedWindow);
				const windowError = checkOptionalRange('windowMinutes', windowMinutes, RANGES.windowMinutes);

				if (windowError) {
					return windowError;
				}

				const base = { type: 'generate_analysis', scope, windowMinutes, reason } as const;

				if (scope === 'platform') {
					return { ...base, subjectId: null, subjectName: null };
				}

				if (scope === 'route') {
					const route = await findRoute(routes, readOptionalString(input, 'pathPrefix') ?? '');

					return typeof route === 'string' ? route : { ...base, subjectId: route.id, subjectName: route.name };
				}

				const service = await services.get(readRequiredString(input, 'serviceSlug'));

				return { ...base, subjectId: service.id, subjectName: service.name };
			},
		},
	];
}

export function scaleSpec(dependencies: ProposalToolDependencies): ProposalSpec {
	return {
		name: 'propose_scale_service',
		description: `Proposes how many managed replicas (containers the control plane creates, 0-${MAX_MANAGED_REPLICAS}) a demo service with a scaling profile runs, on top of its static instances. Fewer drains and removes the newest.`,
		properties: { serviceSlug: SERVICE_SLUG, managedReplicas: { type: 'integer', minimum: 0, maximum: MAX_MANAGED_REPLICAS } },
		required: ['serviceSlug', 'managedReplicas'],
		build: async (input, reason) => {
			const managedReplicas = readRequiredNumber(input, 'managedReplicas');
			const service = await dependencies.services.get(readRequiredString(input, 'serviceSlug'));
			const current = service.scaling.desiredManagedReplicas;
			const problem =
				checkScalable(service) ??
				checkRange('managedReplicas', managedReplicas, { min: 0, max: MAX_MANAGED_REPLICAS }) ??
				checkChanged(`the managed replicas of ${service.slug}`, current, managedReplicas);

			return (
				problem ?? {
					type: 'scale_service',
					serviceSlug: service.slug,
					serviceName: service.name,
					managedReplicas,
					currentManagedReplicas: current,
					reason,
				}
			);
		},
	};
}

export function chaosSpec(dependencies: ProposalToolDependencies): ProposalSpec {
	return {
		name: 'propose_instance_chaos',
		description: 'Proposes a fault on a DEMO instance (latency, errors or down), to show how the gateway reacts. All zeros clears it.',
		properties: {
			serviceSlug: SERVICE_SLUG,
			instanceName: INSTANCE_NAME,
			latencyMs: { type: 'integer', minimum: 0 },
			jitterMs: { type: 'integer', minimum: 0 },
			errorRate: { type: 'number', minimum: 0, maximum: 1 },
			isDown: { type: 'boolean' },
		},
		required: ['serviceSlug', 'instanceName', 'latencyMs', 'jitterMs', 'errorRate', 'isDown'],
		build: async (input, reason) => {
			const chaos = {
				latencyMs: readRequiredNumber(input, 'latencyMs'),
				jitterMs: readRequiredNumber(input, 'jitterMs'),
				errorRate: readRequiredNumber(input, 'errorRate'),
				isDown: readFlag(input, 'isDown'),
			};
			const chaosError = checkChaos(chaos);

			if (chaosError) {
				return chaosError;
			}

			const service = await dependencies.services.get(readRequiredString(input, 'serviceSlug'));
			const instance = findInstance(service, readRequiredString(input, 'instanceName'));

			if (typeof instance === 'string') {
				return instance;
			}

			return { type: 'set_instance_chaos', serviceSlug: service.slug, instanceId: instance.id, instanceName: instance.name, chaos, reason };
		},
	};
}
