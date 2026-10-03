export type GatewayAlertKind = 'route_p95_latency' | 'route_error_rate' | 'instance_unhealthy' | 'circuit_open';
export type AlertSeverity = 'warning' | 'critical';
export type AlertSubjectType = 'route' | 'service' | 'instance';

export type GatewayAlert = {
	readonly id: string;
	readonly kind: GatewayAlertKind;
	readonly severity: AlertSeverity;
	readonly subjectType: AlertSubjectType;
	readonly subjectId: string;
	readonly subjectName: string;
	readonly message: string;
	readonly triggeredAt: string;
	readonly resolvedAt: string | null;
};

export type AlertRuleConfig = {
	readonly kind: GatewayAlertKind;
	readonly isEnabled: boolean;
	// route_p95_latency: ms. route_error_rate: percent. Others: null.
	readonly threshold: number | null;
	readonly sustainedWindows: number;
};

export type UpdateAlertRuleConfigInput = {
	readonly isEnabled: boolean;
	readonly threshold: number | null;
	readonly sustainedWindows: number;
};
