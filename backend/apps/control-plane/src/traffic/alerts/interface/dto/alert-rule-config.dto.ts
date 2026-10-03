import type { AlertRuleConfig, GatewayAlertKind } from '@prisma/control-plane-client';

export class AlertRuleConfigDto {
	readonly kind!: GatewayAlertKind;
	readonly isEnabled!: boolean;
	// route_p95_latency: milliseconds. route_error_rate: percent. Others: null.
	readonly threshold!: number | null;
	readonly sustainedWindows!: number;
}

export function toAlertRuleConfigDto(row: AlertRuleConfig): AlertRuleConfigDto {
	return { kind: row.kind, isEnabled: row.isEnabled, threshold: row.threshold, sustainedWindows: row.sustainedWindows };
}
