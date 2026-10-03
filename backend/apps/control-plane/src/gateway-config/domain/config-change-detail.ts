import type { GatewayAlertKindName } from '@pyle/shared/contracts/names.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';

// What a configuration change did, structured: the console renders it in the
// operator's language, and describeChangeDetail() turns it into the English
// summary kept for the audit trail and read by the AI.

export type FieldChange = { readonly field: string; readonly before: AuditValue; readonly after: AuditValue };

export type ConfigChangeDetail =
	| { readonly kind: 'created' }
	| { readonly kind: 'deleted' }
	| { readonly kind: 'fields'; readonly changes: readonly FieldChange[] }
	| { readonly kind: 'key_issued'; readonly keyPrefix: string }
	| { readonly kind: 'key_revoked'; readonly keyPrefix: string }
	// A revocation undone within the restore window.
	| { readonly kind: 'key_restored'; readonly keyPrefix: string }
	// 0: every route.
	| { readonly kind: 'route_scope'; readonly allowedRouteCount: number }
	| { readonly kind: 'chaos'; readonly latencyMs: number; readonly jitterMs: number; readonly errorRate: number; readonly isDown: boolean }
	| {
			readonly kind: 'alert_rule';
			readonly alertKind: GatewayAlertKindName;
			readonly isEnabled: boolean;
			readonly threshold: number | null;
			readonly sustainedWindows: number;
	  }
	| { readonly kind: 'managed_replicas'; readonly from: number; readonly to: number }
	// A managed replica's lifecycle, written by scaling itself.
	| { readonly kind: 'replica_running' }
	| { readonly kind: 'replica_draining' }
	| { readonly kind: 'replica_failed'; readonly reason: string };

type AuditValue = string | number | boolean | null | readonly (string | number)[];

export const CREATED: ConfigChangeDetail = { kind: 'created' };
export const DELETED: ConfigChangeDetail = { kind: 'deleted' };

const NO_CHANGE_SUMMARY = 'no change';
const UNSET_LABEL = 'none';
const CHANGE_SEPARATOR = ', ';
const PERCENT_FACTOR = 100;

type RawValue = AuditValue | undefined;

// Only the fields that changed, in the order given.
export function diffFields<T extends object>(before: T, after: T, fields: readonly (keyof T & string)[]): ConfigChangeDetail {
	const changes = fields.flatMap((field): FieldChange[] => {
		const previous = toAuditValue(before[field] as RawValue);
		const next = toAuditValue(after[field] as RawValue);

		if (formatValue(previous) === formatValue(next)) {
			return [];
		}

		return [{ field, before: previous, after: next }];
	});

	return { kind: 'fields', changes };
}

// "weight 1 -> 3, isEnabled true -> false", "issued key pyle_live_Ab", ...
export function describeChangeDetail(detail: ConfigChangeDetail): string {
	switch (detail.kind) {
		case 'created':
			return 'created';
		case 'deleted':
			return 'deleted';
		case 'fields':
			return describeFields(detail.changes);
		case 'key_issued':
			return `issued key ${detail.keyPrefix}`;
		case 'key_revoked':
			return `revoked key ${detail.keyPrefix}`;
		case 'key_restored':
			return `restored key ${detail.keyPrefix}`;
		case 'route_scope':
			return detail.allowedRouteCount === 0 ? 'routes: all' : `routes: ${detail.allowedRouteCount} allowed`;

		case 'chaos': {
			const errorPercent = Math.round(detail.errorRate * PERCENT_FACTOR);

			return `chaos latency=${detail.latencyMs}ms jitter=${detail.jitterMs}ms errors=${errorPercent}% down=${detail.isDown}`;
		}

		case 'alert_rule': {
			const state = detail.isEnabled ? 'enabled' : 'disabled';
			const threshold = detail.threshold === null ? '' : `, threshold ${detail.threshold}`;

			return `Alert rule ${detail.alertKind}: ${state}${threshold}, ${detail.sustainedWindows} window(s)`;
		}

		case 'managed_replicas':
			return `managed replicas: ${detail.from} -> ${detail.to}`;
		case 'replica_running':
			return 'provisioning -> running';
		case 'replica_draining':
			return 'draining before removal';
		case 'replica_failed':
			return `failed: ${detail.reason}`;
		default:
			return assertUnreachable(detail);
	}
}

function toAuditValue(value: RawValue): AuditValue {
	return value === undefined ? null : value;
}

function formatValue(value: AuditValue): string {
	if (Array.isArray(value)) {
		return value.length === 0 ? '[]' : `[${value.join(' ')}]`;
	}

	if (value === null) {
		return UNSET_LABEL;
	}

	return String(value);
}

function describeFields(changes: readonly FieldChange[]): string {
	if (changes.length === 0) {
		return NO_CHANGE_SUMMARY;
	}

	return changes.map((change) => `${change.field} ${formatValue(change.before)} -> ${formatValue(change.after)}`).join(CHANGE_SEPARATOR);
}

const DETAIL_KINDS: ReadonlySet<string> = new Set<ConfigChangeDetail['kind']>([
	'created',
	'deleted',
	'fields',
	'key_issued',
	'key_revoked',
	'key_restored',
	'route_scope',
	'chaos',
	'alert_rule',
	'managed_replicas',
	'replica_running',
	'replica_draining',
	'replica_failed',
]);

// Reads back what the recorder stored; anything else (an older row, a hand edit) is no detail.
export function readChangeDetail(value: unknown): ConfigChangeDetail | null {
	const isRecord = typeof value === 'object' && value !== null && !Array.isArray(value);

	if (!isRecord) {
		return null;
	}

	const kind: unknown = (value as Readonly<Record<string, unknown>>).kind;
	const isKnownKind = typeof kind === 'string' && DETAIL_KINDS.has(kind);

	if (!isKnownKind) {
		return null;
	}

	return value as ConfigChangeDetail;
}
