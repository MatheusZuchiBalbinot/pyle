import type { GatewayErrorCode, LoadBalancingStrategy, ServiceInstance, StatusClass } from '../api/adminApiTypes';

// One visible state per instance, most important first.
export type InstanceBadgeState = 'starting' | 'leaving' | 'circuit_open' | 'unhealthy' | 'half_open' | 'drained' | 'healthy' | 'unknown';

export type InstanceBadgeTone = 'danger' | 'warning' | 'muted' | 'success';

export const INSTANCE_BADGE_TONE: Readonly<Record<InstanceBadgeState, InstanceBadgeTone>> = {
	starting: 'muted',
	leaving: 'muted',
	circuit_open: 'danger',
	unhealthy: 'danger',
	half_open: 'warning',
	drained: 'muted',
	healthy: 'success',
	unknown: 'muted',
};

type BadgeInput = Pick<ServiceInstance, 'isEnabled' | 'live' | 'scalingState'>;

export function resolveInstanceBadge(instance: BadgeInput): InstanceBadgeState {
	// A managed replica coming up or going away is neither drained nor broken.
	if (instance.scalingState === 'provisioning') {
		return 'starting';
	}

	if (instance.scalingState === 'draining') {
		return 'leaving';
	}

	const live = instance.live;

	if (live?.circuit === 'open') {
		return 'circuit_open';
	}

	if (live?.health === 'unhealthy') {
		return 'unhealthy';
	}

	if (live?.circuit === 'half_open') {
		return 'half_open';
	}

	if (!instance.isEnabled) {
		return 'drained';
	}

	if (live?.health === 'healthy') {
		return 'healthy';
	}

	return 'unknown';
}

// Out of rotation against the operator's will: what the inbox and the
// overview flag. A drained instance is not trouble, it was asked for.
export function isInstanceInTrouble(instance: BadgeInput): boolean {
	const state = resolveInstanceBadge(instance);
	const isOutOfRotation = state === 'circuit_open' || state === 'unhealthy';

	return instance.isEnabled && isOutOfRotation;
}

export const STRATEGY_LABEL_KEY: Readonly<Record<LoadBalancingStrategy, string>> = {
	round_robin: 'gateway.strategy.round_robin',
	least_connections: 'gateway.strategy.least_connections',
	weighted_random: 'gateway.strategy.weighted_random',
};

export const GATEWAY_ERROR_LABEL_KEY: Readonly<Record<GatewayErrorCode, string>> = {
	route_not_found: 'gateway.errorCode.route_not_found',
	method_not_allowed: 'gateway.errorCode.method_not_allowed',
	missing_api_key: 'gateway.errorCode.missing_api_key',
	invalid_api_key: 'gateway.errorCode.invalid_api_key',
	route_not_allowed: 'gateway.errorCode.route_not_allowed',
	rate_limited: 'gateway.errorCode.rate_limited',
	no_healthy_instance: 'gateway.errorCode.no_healthy_instance',
	upstream_unreachable: 'gateway.errorCode.upstream_unreachable',
	upstream_timeout: 'gateway.errorCode.upstream_timeout',
	gateway_not_ready: 'gateway.errorCode.gateway_not_ready',
	internal_error: 'gateway.errorCode.internal_error',
};

const STATUS_CLASS_SIZE = 100;

export function statusClassOf(status: number): StatusClass | null {
	const statusClass = `${Math.floor(status / STATUS_CLASS_SIZE)}xx`;
	const isKnown = statusClass === '2xx' || statusClass === '3xx' || statusClass === '4xx' || statusClass === '5xx';

	return isKnown ? statusClass : null;
}
