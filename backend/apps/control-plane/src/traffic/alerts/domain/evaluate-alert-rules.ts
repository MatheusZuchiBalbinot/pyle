import type { AlertSeverity, AlertSubjectType, GatewayAlertKind } from '@prisma/control-plane-client';

import type { InstanceCircuitStatus, InstanceHealthStatus } from '@pyle/shared/contracts/instance-live-state.js';

export type AlertRule = {
	readonly isEnabled: boolean;
	readonly threshold: number | null;
	readonly sustainedWindows: number;
};

export type AlertRules = Readonly<Record<GatewayAlertKind, AlertRule>>;

// One 10 s window of one route; null when the route had no traffic then.
export type RouteWindow = {
	readonly requestCount: number;
	readonly p95Ms: number | null;
	readonly errorRatePercent: number;
} | null;

export type RouteAlertSubject = {
	readonly routeId: string;
	readonly routeName: string;
	// Oldest first; at least as many as the largest sustainedWindows.
	readonly windows: readonly RouteWindow[];
};

export type InstanceAlertSubject = {
	readonly instanceId: string;
	readonly instanceName: string;
	// Null when no gateway has reported on the instance yet.
	readonly health: InstanceHealthStatus | null;
	readonly circuit: InstanceCircuitStatus | null;
};

export type OpenAlert = {
	readonly id: string;
	readonly kind: GatewayAlertKind;
	readonly subjectType: AlertSubjectType;
	readonly subjectId: string;
};

export type AlertToOpen = {
	readonly kind: GatewayAlertKind;
	readonly severity: AlertSeverity;
	readonly subjectType: AlertSubjectType;
	readonly subjectId: string;
	readonly subjectName: string;
	readonly message: string;
};

export type AlertEvaluationInput = {
	readonly rules: AlertRules;
	// Every active route and instance: an open alert on anything else is
	// resolved (its subject is gone).
	readonly routes: readonly RouteAlertSubject[];
	readonly instances: readonly InstanceAlertSubject[];
	readonly openAlerts: readonly OpenAlert[];
};

export type InstanceAlertKind = 'instance_unhealthy' | 'circuit_open';

type AlertEvaluation = {
	readonly toOpen: readonly AlertToOpen[];
	readonly toResolve: readonly OpenAlert[];
};
type RouteKind = 'route_p95_latency' | 'route_error_rate';
type InstanceKind = InstanceAlertKind;

// Past twice the limit, the alert is critical.
const CRITICAL_THRESHOLD_FACTOR = 2;

const ROUTE_KINDS: readonly RouteKind[] = ['route_p95_latency', 'route_error_rate'];
const INSTANCE_KINDS: readonly InstanceKind[] = ['instance_unhealthy', 'circuit_open'];

type RouteMetric = {
	readonly valueOf: (window: NonNullable<RouteWindow>) => number | null;
	readonly describe: (value: number, rule: UsableRule) => string;
};

type UsableRule = AlertRule & { readonly threshold: number };

const ROUTE_METRICS: Readonly<Record<RouteKind, RouteMetric>> = {
	route_p95_latency: {
		valueOf: (window) => window.p95Ms,
		describe: (value, rule) => `p95 latency ${Math.round(value)} ms for ${rule.sustainedWindows} consecutive windows (limit ${rule.threshold} ms)`,
	},
	route_error_rate: {
		valueOf: (window) => (window.requestCount === 0 ? null : window.errorRatePercent),
		describe: (value, rule) =>
			`${value.toFixed(1)}% of requests failed with 5xx for ${rule.sustainedWindows} consecutive windows (limit ${rule.threshold}%)`,
	},
};

// Whether an instance's live state is bad (true), fine (false) or gives no
// verdict (null): unknown health, or a half-open circuit still probing
// (resolving then would churn the alert on every failed probe).
const HEALTH_VERDICTS: Readonly<Record<InstanceHealthStatus, boolean | null>> = { healthy: false, unhealthy: true, unknown: null };
const CIRCUIT_VERDICTS: Readonly<Record<InstanceCircuitStatus, boolean | null>> = { closed: false, open: true, half_open: null };

const INSTANCE_CONDITIONS: Readonly<Record<InstanceKind, (instance: InstanceAlertSubject) => boolean | null>> = {
	instance_unhealthy: (instance) => (instance.health === null ? null : HEALTH_VERDICTS[instance.health]),
	circuit_open: (instance) => (instance.circuit === null ? null : CIRCUIT_VERDICTS[instance.circuit]),
};

export const INSTANCE_ALERT_MESSAGES: Readonly<Record<InstanceKind, (instanceName: string) => string>> = {
	instance_unhealthy: (instanceName) => `Instance ${instanceName} is failing its health checks`,
	circuit_open: (instanceName) => `The circuit of instance ${instanceName} is open after repeated request failures`,
};

export const INSTANCE_ALERT_SEVERITY: Readonly<Record<InstanceKind, AlertSeverity>> = { instance_unhealthy: 'critical', circuit_open: 'warning' };

type Verdict = { readonly isBreached: boolean; readonly value: number } | null;

export function evaluateAlertRules(input: AlertEvaluationInput): AlertEvaluation {
	const evaluations = [
		...ROUTE_KINDS.map((kind) => evaluateRouteKind(kind, input)),
		...INSTANCE_KINDS.map((kind) => evaluateInstanceKind(kind, input)),
	];

	return { toOpen: evaluations.flatMap((evaluation) => evaluation.toOpen), toResolve: evaluations.flatMap((evaluation) => evaluation.toResolve) };
}

// How many windows the evaluation needs: the longest sustained rule.
export function windowsNeeded(rules: AlertRules): number {
	return Math.max(...ROUTE_KINDS.map((kind) => rules[kind].sustainedWindows));
}

function isUsableRouteRule(rule: AlertRule): rule is UsableRule {
	return rule.isEnabled && rule.threshold !== null;
}

function severityFor(value: number, threshold: number): AlertSeverity {
	return value > threshold * CRITICAL_THRESHOLD_FACTOR ? 'critical' : 'warning';
}

function verdictFor(window: RouteWindow, metric: RouteMetric, threshold: number): Verdict {
	if (window === null) {
		return null;
	}

	const value = metric.valueOf(window);

	if (value === null) {
		return null;
	}

	return { isBreached: value > threshold, value };
}

function openAlertFor(openAlerts: readonly OpenAlert[], kind: GatewayAlertKind, subjectId: string): OpenAlert | undefined {
	return openAlerts.find((alert) => alert.kind === kind && alert.subjectId === subjectId);
}

// Opens when every one of the last N windows breaches; resolves when the
// newest window has traffic and does not. A window without traffic changes
// nothing either way.
function evaluateRouteKind(kind: RouteKind, input: AlertEvaluationInput): AlertEvaluation {
	const rule = input.rules[kind];
	const openOfKind = input.openAlerts.filter((alert) => alert.kind === kind);

	if (!isUsableRouteRule(rule)) {
		return { toOpen: [], toResolve: openOfKind };
	}

	const metric = ROUTE_METRICS[kind];
	const toOpen: AlertToOpen[] = [];
	const toResolve: OpenAlert[] = [];

	for (const route of input.routes) {
		const verdicts = route.windows.slice(-rule.sustainedWindows).map((window) => verdictFor(window, metric, rule.threshold));
		const newest = verdicts.at(-1) ?? null;
		const open = openAlertFor(openOfKind, kind, route.routeId);
		const isSustained = verdicts.length === rule.sustainedWindows && verdicts.every((verdict) => verdict?.isBreached === true);

		if (open === undefined && isSustained && newest !== null) {
			const message = metric.describe(newest.value, rule);

			toOpen.push({
				kind,
				severity: severityFor(newest.value, rule.threshold),
				subjectType: 'route',
				subjectId: route.routeId,
				subjectName: route.routeName,
				message,
			});
		}

		const isRecovered = newest !== null && !newest.isBreached;

		if (open !== undefined && isRecovered) {
			toResolve.push(open);
		}
	}

	const routeIds = new Set(input.routes.map((route) => route.routeId));
	const orphaned = openOfKind.filter((alert) => !routeIds.has(alert.subjectId));

	return { toOpen, toResolve: [...toResolve, ...orphaned] };
}

// The relay opens instance alerts at once; this pass catches what it missed (a control
// plane that was down).
function evaluateInstanceKind(kind: InstanceKind, input: AlertEvaluationInput): AlertEvaluation {
	const rule = input.rules[kind];
	const openOfKind = input.openAlerts.filter((alert) => alert.kind === kind);

	if (!rule.isEnabled) {
		return { toOpen: [], toResolve: openOfKind };
	}

	const isBad = INSTANCE_CONDITIONS[kind];
	const toOpen: AlertToOpen[] = [];
	const toResolve: OpenAlert[] = [];

	for (const instance of input.instances) {
		const condition = isBad(instance);
		const open = openAlertFor(openOfKind, kind, instance.instanceId);

		if (open === undefined && condition === true) {
			const message = INSTANCE_ALERT_MESSAGES[kind](instance.instanceName);

			toOpen.push({
				kind,
				severity: INSTANCE_ALERT_SEVERITY[kind],
				subjectType: 'instance',
				subjectId: instance.instanceId,
				subjectName: instance.instanceName,
				message,
			});
		}

		if (open !== undefined && condition === false) {
			toResolve.push(open);
		}
	}

	const instanceIds = new Set(input.instances.map((instance) => instance.instanceId));
	const orphaned = openOfKind.filter((alert) => !instanceIds.has(alert.subjectId));

	return { toOpen, toResolve: [...toResolve, ...orphaned] };
}
