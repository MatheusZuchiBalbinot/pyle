import type { AdminOverview, GatewayAlert, Service } from '@/app/api/adminApiTypes';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { isInstanceInTrouble, resolveInstanceBadge } from '@/app/lib/gatewayLabels';

export type AttentionTone = 'danger' | 'warning';

export type AttentionItem = {
	readonly id: string;
	readonly tone: AttentionTone;
	// i18n key under overviewPage.attention and its values.
	readonly messageKey: string;
	readonly values: Readonly<Record<string, string | number>>;
	// What a click opens; null when there is nothing to open.
	readonly selection: ConsoleSelection | null;
};

export function selectionForAlert(alert: GatewayAlert, services: readonly Service[]): ConsoleSelection | null {
	if (alert.subjectType === 'route') {
		return { type: 'route-traffic', routeId: alert.subjectId };
	}

	if (alert.subjectType === 'service') {
		const service = services.find((candidate) => candidate.id === alert.subjectId);

		return service ? { type: 'service', serviceSlug: service.slug, instanceId: null } : null;
	}

	const owner = services.find((service) => service.instances.some((instance) => instance.id === alert.subjectId));

	return owner ? { type: 'service', serviceSlug: owner.slug, instanceId: alert.subjectId } : null;
}

export function buildAttentionItems(overview: AdminOverview): readonly AttentionItem[] {
	const circuitOpen = instanceItems(overview.services, 'circuit_open');
	const unhealthy = instanceItems(overview.services, 'unhealthy');
	const troubledInstances = overview.services.flatMap((service) => service.instances.filter(isInstanceInTrouble));
	const coveredInstanceIds = new Set(troubledInstances.map((instance) => instance.id));

	return [
		...gatewayItems(overview),
		...circuitOpen,
		...unhealthy,
		...alertItems(overview, 'critical', coveredInstanceIds),
		...alertItems(overview, 'warning', coveredInstanceIds),
		...drainedServiceItems(overview.services),
		...rateLimitItems(overview),
	];
}

function gatewayItems(overview: AdminOverview): readonly AttentionItem[] {
	const isAnyAlive = overview.gateway.gateways.some((gateway) => gateway.isAlive);

	if (!isAnyAlive) {
		return [{ id: 'gateway-down', tone: 'danger', messageKey: 'overviewPage.attention.gatewayDown', values: {}, selection: null }];
	}

	return [];
}

function instanceItems(services: readonly Service[], badge: 'circuit_open' | 'unhealthy'): readonly AttentionItem[] {
	return services.flatMap((service) =>
		service.instances
			.filter((instance) => instance.isEnabled && resolveInstanceBadge(instance) === badge)
			.map((instance) => ({
				id: `${badge}:${instance.id}`,
				tone: 'danger' as const,
				messageKey: `overviewPage.attention.${badge === 'circuit_open' ? 'circuitOpen' : 'instanceUnhealthy'}`,
				values: { instance: instance.name, service: service.name },
				selection: { type: 'service', serviceSlug: service.slug, instanceId: instance.id } as const,
			})),
	);
}

// Instance alerts repeat what the instance items already say; they only
// show up here once the instance itself looks fine again.
function alertItems(overview: AdminOverview, severity: GatewayAlert['severity'], coveredInstanceIds: ReadonlySet<string>): readonly AttentionItem[] {
	const instanceAlertKinds: ReadonlySet<GatewayAlert['kind']> = new Set(['instance_unhealthy', 'circuit_open']);

	return overview.openAlerts
		.filter((alert) => alert.severity === severity)
		.filter((alert) => !(instanceAlertKinds.has(alert.kind) && coveredInstanceIds.has(alert.subjectId)))
		.map((alert) => ({
			id: `alert:${alert.id}`,
			tone: severity === 'critical' ? ('danger' as const) : ('warning' as const),
			messageKey: `overviewPage.attention.alert.${alert.kind}`,
			values: { subject: alert.subjectName },
			selection: selectionForAlert(alert, overview.services),
		}));
}

function drainedServiceItems(services: readonly Service[]): readonly AttentionItem[] {
	return services
		.filter((service) => service.instances.length > 0 && service.instances.every((instance) => !instance.isEnabled))
		.map((service) => ({
			id: `no-enabled:${service.id}`,
			tone: 'warning' as const,
			messageKey: 'overviewPage.attention.noEnabledInstance',
			values: { service: service.name },
			selection: { type: 'service', serviceSlug: service.slug, instanceId: null } as const,
		}));
}

function rateLimitItems(overview: AdminOverview): readonly AttentionItem[] {
	return overview.gateway.gateways
		.filter((gateway) => gateway.isAlive && gateway.isRateLimitDegraded)
		.map((gateway) => ({
			id: `rate-limit:${gateway.gatewayId}`,
			tone: 'warning' as const,
			messageKey: 'overviewPage.attention.rateLimitDegraded',
			values: { gateway: gateway.gatewayId },
			selection: null,
		}));
}
