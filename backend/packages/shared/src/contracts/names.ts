// Mirrors of Prisma enums, so neither side needs the Prisma client.
export const GATEWAY_ALERT_KIND_NAMES = ['route_p95_latency', 'route_error_rate', 'instance_unhealthy', 'circuit_open'] as const;
export type GatewayAlertKindName = (typeof GATEWAY_ALERT_KIND_NAMES)[number];

export const CONFIG_ENTITY_TYPE_NAMES = ['service', 'instance', 'route', 'consumer', 'api_key', 'alert_rule'] as const;
export type ConfigEntityTypeName = (typeof CONFIG_ENTITY_TYPE_NAMES)[number];

export const CONFIG_CHANGE_ACTION_NAMES = ['created', 'updated', 'deleted'] as const;
export type ConfigChangeActionName = (typeof CONFIG_CHANGE_ACTION_NAMES)[number];

export const ALERT_SUBJECT_TYPE_NAMES = ['route', 'service', 'instance'] as const;
export type AlertSubjectTypeName = (typeof ALERT_SUBJECT_TYPE_NAMES)[number];

export const INSTANCE_STATE_NAMES = ['healthy', 'unhealthy', 'circuit_closed', 'circuit_open', 'circuit_half_open'] as const;
export type InstanceStateName = (typeof INSTANCE_STATE_NAMES)[number];

export const INSTANCE_STATE_KIND_NAMES = ['health', 'circuit'] as const;
export type InstanceStateKindName = (typeof INSTANCE_STATE_KIND_NAMES)[number];

export function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
	return typeof value === 'string' && (values as readonly string[]).includes(value);
}
