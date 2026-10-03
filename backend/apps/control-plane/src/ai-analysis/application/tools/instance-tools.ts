import type { ServicesService } from '../../../gateway-config/application/services.service.js';
import type { ServiceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';
import type { TrafficQueryService } from '../../../traffic/application/traffic-query.service.js';
import type { InstanceStateEventRepository } from '../../../traffic/infrastructure/instance-state-event.repository.js';
import type { TrafficNamesRepository } from '../../../traffic/infrastructure/traffic-names.repository.js';
import type { AiTool } from '../ai-tool.js';
import { compactTotals } from './compact-traffic.js';
import { readBoundedInteger, readOptionalString, readRequiredString, toJson, toPercent } from './tool-inputs.js';

const SHARE_WINDOW = '15m';
const SINCE_MINUTES = { min: 1, max: 1440, fallback: 60 } as const;
const MAX_EVENTS = 50;
const MS_PER_MINUTE = 60_000;

export type InstanceToolDependencies = {
	readonly services: ServicesService;
	readonly traffic: TrafficQueryService;
	readonly stateEvents: InstanceStateEventRepository;
	readonly names: TrafficNamesRepository;
	readonly now: () => number;
};

export function buildInstanceTools(dependencies: InstanceToolDependencies): readonly AiTool[] {
	return [serviceInstancesTool(dependencies), healthEventsTool(dependencies)];
}

function serviceConfig(service: ServiceDto): Readonly<Record<string, unknown>> {
	return {
		slug: service.slug,
		name: service.name,
		lbStrategy: service.lbStrategy,
		timeoutMs: service.timeoutMs,
		retryMaxAttempts: service.retryMaxAttempts,
		healthCheck: service.healthCheck,
		circuit: service.circuit,
		routeCount: service.routeCount,
		// Null profile: instances are managed by hand; otherwise the managed
		// (Docker) replicas wanted, on top of the static ones.
		scaling: service.scaling,
	};
}

function serviceInstancesTool(dependencies: InstanceToolDependencies): AiTool {
	return {
		name: 'get_service_instances',
		description:
			"One service: balancing strategy, timeouts, retries, health check and circuit settings, and each instance's live state (health, circuit, requests in flight), weight, whether it is drained, active chaos faults, and its share, p95 and 5xx rate over the last 15 minutes.",
		inputSchema: { type: 'object', properties: { serviceSlug: { type: 'string' } }, required: ['serviceSlug'], additionalProperties: false },
		run: async (input) => {
			const slug = readRequiredString(input, 'serviceSlug');
			const [service, traffic] = await Promise.all([
				dependencies.services.get(slug),
				dependencies.traffic.service(slug, { kind: 'named', window: SHARE_WINDOW }),
			]);
			const trafficById = new Map(traffic.instances.map((instance) => [instance.instanceId, instance]));
			const instances = service.instances.map((instance) => {
				const recent = trafficById.get(instance.id);

				return {
					instanceId: instance.id,
					name: instance.name,
					url: instance.url,
					weight: instance.weight,
					isEnabled: instance.isEnabled,
					source: instance.source,
					scalingState: instance.scalingState,
					health: instance.live?.health ?? 'unknown',
					circuit: instance.live?.circuit ?? 'unknown',
					inFlight: instance.live?.inFlight ?? null,
					consecutiveFailures: instance.live?.consecutiveFailures ?? null,
					chaos: instance.chaos,
					sharePct15m: recent ? toPercent(recent.share) : 0,
					last15m: recent ? compactTotals(recent.totals) : null,
				};
			});

			return toJson({ service: serviceConfig(service), instances });
		},
	};
}

function healthEventsTool(dependencies: InstanceToolDependencies): AiTool {
	return {
		name: 'get_health_events',
		description: 'Instance health and circuit transitions reported by the gateways (newest first, at most 50), for one service or all.',
		inputSchema: {
			type: 'object',
			properties: { serviceSlug: { type: 'string' }, sinceMinutes: { type: 'integer', minimum: SINCE_MINUTES.min, maximum: SINCE_MINUTES.max } },
			required: [],
			additionalProperties: false,
		},
		run: async (input) => {
			const sinceMinutes = readBoundedInteger(input, 'sinceMinutes', SINCE_MINUTES);
			const slug = readOptionalString(input, 'serviceSlug');
			const instanceIds = slug ? (await dependencies.services.get(slug)).instances.map((instance) => instance.id) : null;
			const since = new Date(dependencies.now() - sinceMinutes * MS_PER_MINUTE);
			const events = await dependencies.stateEvents.listSince(since, instanceIds, MAX_EVENTS);
			const names = await dependencies.names.instances([...new Set(events.map((event) => event.instanceId))]);

			return toJson(
				events.map((event) => {
					const name = names.get(event.instanceId);

					return {
						at: event.occurredAt.toISOString(),
						instance: name ? `${name.serviceSlug}/${name.name}` : event.instanceId,
						kind: event.kind,
						from: event.fromState,
						to: event.toState,
						reason: event.reason,
						gatewayId: event.gatewayId,
					};
				}),
			);
		},
	};
}
