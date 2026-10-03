import type { GatewayAlertKind } from '@prisma/control-plane-client';

// Keyed by the Prisma enum, so a new kind stops compiling until it is added here.
const ALERT_RULE_KIND_SET: Readonly<Record<GatewayAlertKind, true>> = {
	route_p95_latency: true,
	route_error_rate: true,
	instance_unhealthy: true,
	circuit_open: true,
};

export const ALERT_RULE_KINDS = Object.keys(ALERT_RULE_KIND_SET) as readonly GatewayAlertKind[];

type ThresholdBounds = { readonly min: number; readonly max: number };

export function isAlertRuleKind(value: unknown): value is GatewayAlertKind {
	return typeof value === 'string' && value in ALERT_RULE_KIND_SET;
}

// Latency in milliseconds, error rate in percent; the instance kinds fire
// on a state change and take no threshold. Mirrored by the console's form.
export const THRESHOLD_BOUNDS_BY_KIND: Readonly<Record<GatewayAlertKind, ThresholdBounds | null>> = {
	route_p95_latency: { min: 1, max: 60_000 },
	route_error_rate: { min: 1, max: 100 },
	instance_unhealthy: null,
	circuit_open: null,
};

export type AlertRuleDefaults = { readonly isEnabled: boolean; readonly threshold: number | null; readonly sustainedWindows: number };

// Written once per kind when its row is missing (a fresh database, a new
// kind); never over an operator's own values.
export const DEFAULT_ALERT_RULES: Readonly<Record<GatewayAlertKind, AlertRuleDefaults>> = {
	route_p95_latency: { isEnabled: true, threshold: 800, sustainedWindows: 3 },
	route_error_rate: { isEnabled: true, threshold: 5, sustainedWindows: 3 },
	instance_unhealthy: { isEnabled: true, threshold: null, sustainedWindows: 1 },
	circuit_open: { isEnabled: true, threshold: null, sustainedWindows: 1 },
};

export const MIN_SUSTAINED_WINDOWS = 1;
export const MAX_SUSTAINED_WINDOWS = 30;
