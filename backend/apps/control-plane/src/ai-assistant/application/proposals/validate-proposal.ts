import { MAX_CHAOS_ERROR_RATE, MAX_CHAOS_JITTER_MS, MAX_CHAOS_LATENCY_MS, type ChaosState } from '@pyle/shared/contracts/chaos-state.js';
import type { LoadBalancingStrategyName } from '@pyle/shared/contracts/config-snapshot.js';
import type { GatewayAlertKindName } from '@pyle/shared/contracts/names.js';

import type { ServiceDto } from '../../../gateway-config/interface/dto/gateway-config-responses.js';
import { MAX_SUSTAINED_WINDOWS, MIN_SUSTAINED_WINDOWS, THRESHOLD_BOUNDS_BY_KIND } from '../../../traffic/alerts/domain/alert-rule-kinds.js';

// Null when the proposal would do something, otherwise the reason it would not, for the
// model to relay. Ranges mirror the admin API DTOs.

type Range = { readonly min: number; readonly max: number };

export const RANGES = {
	weight: { min: 1, max: 100 },
	serviceTimeoutMs: { min: 100, max: 60_000 },
	retryMaxAttempts: { min: 1, max: 5 },
	routeTimeoutMs: { min: 100, max: 60_000 },
	routeRateLimit: { min: 1, max: 100_000 },
	consumerRateLimit: { min: 1, max: 1_000_000 },
	windowMinutes: { min: 5, max: 1440 },
} as const;

type AlertRuleState = { readonly isEnabled: boolean; readonly threshold: number | null; readonly sustainedWindows: number };

type Instance = ServiceDto['instances'][number];

export function checkRange(name: string, value: number, range: Range): string | null {
	const isValid = Number.isInteger(value) && value >= range.min && value <= range.max;

	return isValid ? null : `${name} must be an integer between ${range.min} and ${range.max}`;
}

export function findInstance(service: ServiceDto, instanceName: string): Instance | string {
	const instance = service.instances.find((candidate) => candidate.name === instanceName);

	if (instance) {
		return instance;
	}

	return `service ${service.slug} has no instance "${instanceName}"; its instances are ${service.instances.map((candidate) => candidate.name).join(', ')}`;
}

export function checkDrain(instance: Instance): string | null {
	if (!instance.isEnabled) {
		return `instance ${instance.name} is already drained`;
	}

	return null;
}

export function checkEnable(instance: Instance): string | null {
	if (instance.isEnabled) {
		return `instance ${instance.name} is already enabled`;
	}

	return null;
}

export function checkWeight(service: ServiceDto, instance: Instance, weight: number): string | null {
	const rangeError = checkRange('weight', weight, RANGES.weight);

	if (rangeError) {
		return rangeError;
	}

	if (service.lbStrategy !== 'weighted_random') {
		return `weight only matters with weighted_random; service ${service.slug} uses ${service.lbStrategy}`;
	}

	if (instance.weight === weight) {
		return `instance ${instance.name} already has weight ${weight}`;
	}

	return null;
}

export function checkScalable(service: ServiceDto): string | null {
	if (service.scaling.profile !== null) {
		return null;
	}

	return `service ${service.slug} has no scaling profile: its instances are managed by hand`;
}

export function checkStrategy(service: ServiceDto, strategy: LoadBalancingStrategyName): string | null {
	if (service.lbStrategy === strategy) {
		return `service ${service.slug} already uses ${strategy}`;
	}

	return null;
}

export function checkChanged(what: string, current: number | null, next: number | null): string | null {
	if (current === next) {
		return `${what} is already ${next === null ? 'unset' : next}`;
	}

	return null;
}

export function checkOptionalRange(name: string, value: number | null, range: Range): string | null {
	if (value === null) {
		return null;
	}

	return checkRange(name, value, range);
}

export function checkAlertRule(kind: GatewayAlertKindName, current: AlertRuleState, next: AlertRuleState): string | null {
	const thresholdError = checkThreshold(kind, next.threshold);

	if (thresholdError) {
		return thresholdError;
	}

	const windowsError = checkRange('sustainedWindows', next.sustainedWindows, { min: MIN_SUSTAINED_WINDOWS, max: MAX_SUSTAINED_WINDOWS });

	if (windowsError) {
		return windowsError;
	}

	const isSame = current.isEnabled === next.isEnabled && current.threshold === next.threshold && current.sustainedWindows === next.sustainedWindows;

	return isSame ? `the ${kind} rule already has these settings` : null;
}

export function checkChaos(chaos: ChaosState): string | null {
	return (
		checkRange('latencyMs', chaos.latencyMs, { min: 0, max: MAX_CHAOS_LATENCY_MS }) ??
		checkRange('jitterMs', chaos.jitterMs, { min: 0, max: MAX_CHAOS_JITTER_MS }) ??
		(chaos.errorRate >= 0 && chaos.errorRate <= MAX_CHAOS_ERROR_RATE ? null : `errorRate must be between 0 and ${MAX_CHAOS_ERROR_RATE}`)
	);
}

function checkThreshold(kind: GatewayAlertKindName, threshold: number | null): string | null {
	const bounds = THRESHOLD_BOUNDS_BY_KIND[kind];

	if (bounds === null) {
		return threshold === null ? null : `the ${kind} rule takes no threshold`;
	}

	if (threshold === null) {
		return `the ${kind} rule needs a threshold`;
	}

	const isInRange = threshold >= bounds.min && threshold <= bounds.max;

	return isInRange ? null : `the ${kind} threshold must be between ${bounds.min} and ${bounds.max}`;
}
