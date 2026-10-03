import type { GatewayAlertKind } from './alerts';

export type ConfigEntityType = 'service' | 'instance' | 'route' | 'consumer' | 'api_key' | 'alert_rule';
export type ConfigChangeAction = 'created' | 'updated' | 'deleted';

export type AuditValue = string | number | boolean | null | readonly (string | number)[];

export type FieldChange = { readonly field: string; readonly before: AuditValue; readonly after: AuditValue };

export type ConfigChangeDetail =
	| { readonly kind: 'created' }
	| { readonly kind: 'deleted' }
	| { readonly kind: 'fields'; readonly changes: readonly FieldChange[] }
	| { readonly kind: 'key_issued'; readonly keyPrefix: string }
	| { readonly kind: 'key_revoked'; readonly keyPrefix: string }
	| { readonly kind: 'key_restored'; readonly keyPrefix: string }
	// 0: every route.
	| { readonly kind: 'route_scope'; readonly allowedRouteCount: number }
	| { readonly kind: 'chaos'; readonly latencyMs: number; readonly jitterMs: number; readonly errorRate: number; readonly isDown: boolean }
	| {
			readonly kind: 'alert_rule';
			readonly alertKind: GatewayAlertKind;
			readonly isEnabled: boolean;
			readonly threshold: number | null;
			readonly sustainedWindows: number;
	  }
	| { readonly kind: 'managed_replicas'; readonly from: number; readonly to: number }
	| { readonly kind: 'replica_running' }
	| { readonly kind: 'replica_draining' }
	| { readonly kind: 'replica_failed'; readonly reason: string };

export type ConfigChangeEvent = {
	readonly id: string;
	readonly entityType: ConfigEntityType;
	readonly entityId: string;
	// Null on changes recorded before names were kept.
	readonly entityName: string | null;
	readonly action: ConfigChangeAction;
	// English, for the audit trail; the console renders detail when there is one.
	readonly summary: string;
	readonly detail: ConfigChangeDetail | null;
	readonly actorEmail: string | null;
	readonly occurredAt: string;
};

export type ConfigActivityFilter = {
	readonly entityType?: ConfigEntityType;
	readonly entityId?: string;
};
