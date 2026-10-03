const GATEWAY_REDIS_PREFIX = 'pyle:gw';

// Control plane → data plane: a configuration row changed (ConfigChangedMessage).
export const CONFIG_CHANGED_CHANNEL = `${GATEWAY_REDIS_PREFIX}:config-changed`;
// Data plane → control plane: GatewayEvent.
export const GATEWAY_EVENTS_CHANNEL = `${GATEWAY_REDIS_PREFIX}:events`;
// Hash: instanceId → InstanceLiveState JSON.
export const INSTANCE_STATE_HASH = `${GATEWAY_REDIS_PREFIX}:instance-state`;
// List of RequestLogEntry JSON, newest first.
export const REQUEST_LOG_LIST = `${GATEWAY_REDIS_PREFIX}:request-log`;

const HEARTBEAT_KEY_PREFIX = `${GATEWAY_REDIS_PREFIX}:heartbeat:`;

export const HEARTBEAT_KEY_PATTERN = `${HEARTBEAT_KEY_PREFIX}*`;

export function heartbeatKey(gatewayId: string): string {
	return `${HEARTBEAT_KEY_PREFIX}${gatewayId}`;
}

export function consumerRateLimitKey(consumerId: string, windowStartMs: number): string {
	return `${GATEWAY_REDIS_PREFIX}:rl:consumer:${consumerId}:${windowStartMs}`;
}

// consumerKey is a consumer id, or anonymousConsumerKey(ip) on public routes.
export function routeRateLimitKey(routeId: string, consumerKey: string, windowStartMs: number): string {
	return `${GATEWAY_REDIS_PREFIX}:rl:route:${routeId}:${consumerKey}:${windowStartMs}`;
}

export function anonymousConsumerKey(ip: string): string {
	return `anon:${ip}`;
}

export function chaosStateKey(instanceId: string): string {
	return `${GATEWAY_REDIS_PREFIX}:chaos:${instanceId}`;
}
