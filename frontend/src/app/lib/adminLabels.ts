import type { AiProvider, GatewayAlertKind, SystemHealthComponent } from '../api/adminApiTypes';

// Product names, not translated.
export const SYSTEM_COMPONENT_LABELS: Readonly<Record<SystemHealthComponent, string>> = {
	control_plane_db_primary: 'Postgres',
	control_plane_redis: 'Redis',
	gateway: 'Gateway',
	docker: 'Docker',
};

export const AI_PROVIDER_LABELS: Readonly<Record<AiProvider, string>> = { anthropic: 'Anthropic', groq: 'Groq' };

export const ALERT_KIND_LABEL_KEYS: Readonly<Record<GatewayAlertKind, string>> = {
	route_p95_latency: 'alertKinds.routeP95Latency',
	route_error_rate: 'alertKinds.routeErrorRate',
	instance_unhealthy: 'alertKinds.instanceUnhealthy',
	circuit_open: 'alertKinds.circuitOpen',
};
