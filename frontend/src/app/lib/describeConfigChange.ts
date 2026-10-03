import type { AuditValue, ConfigChangeDetail, ConfigChangeEvent, FieldChange, LoadBalancingStrategy } from '../api/adminApiTypes';
import { ALERT_KIND_LABEL_KEYS } from './adminLabels';
import { assertUnreachable } from './assertUnreachable';
import { STRATEGY_LABEL_KEY } from './gatewayLabels';

export type TranslateFn = (key: string, options?: Readonly<Record<string, unknown>>) => string;

const FIELD_SEPARATOR = ' · ';
const LIST_SEPARATOR = ', ';
const PERCENT_FACTOR = 100;
const MILLISECONDS_SUFFIX = 'Ms';
const PREFIX = 'overviewPage.changes';

// Fields whose empty list means "no restriction" rather than "nothing".
const EMPTY_MEANS_ALL: ReadonlySet<string> = new Set(['methods']);
// Fields whose unset value means "no limit".
const NULL_MEANS_UNLIMITED: ReadonlySet<string> = new Set(['rateLimitPerMinute', 'timeoutMs']);

// What changed, in the operator's language; null when the action badge already says it all.
export function describeConfigChangeDetail(detail: ConfigChangeDetail, t: TranslateFn): string | null {
	switch (detail.kind) {
		case 'created':
		case 'deleted':
			return null;
		case 'fields':
			if (detail.changes.length === 0) {
				return t(`${PREFIX}.noChange`);
			}

			return detail.changes.map((change) => describeField(change, t)).join(FIELD_SEPARATOR);
		case 'key_issued':
			return t(`${PREFIX}.key.issued`, { prefix: detail.keyPrefix });
		case 'key_revoked':
			return t(`${PREFIX}.key.revoked`, { prefix: detail.keyPrefix });
		case 'key_restored':
			return t(`${PREFIX}.key.restored`, { prefix: detail.keyPrefix });
		case 'route_scope':
			if (detail.allowedRouteCount === 0) {
				return t(`${PREFIX}.routeScope.all`);
			}

			return t(`${PREFIX}.routeScope.some`, { count: detail.allowedRouteCount });
		case 'chaos':
			return describeChaos(detail, t);
		case 'alert_rule':
			return describeAlertRule(detail, t);
		case 'managed_replicas':
			return t(`${PREFIX}.managedReplicas`, { from: detail.from, to: detail.to });
		case 'replica_running':
			return t(`${PREFIX}.replica.running`);
		case 'replica_draining':
			return t(`${PREFIX}.replica.draining`);
		case 'replica_failed':
			return t(`${PREFIX}.replica.failed`, { reason: detail.reason });
		default:
			return assertUnreachable(detail);
	}
}

// Rows recorded before the detail existed fall back to their English summary.
export function describeConfigChange(change: Pick<ConfigChangeEvent, 'detail' | 'summary'>, t: TranslateFn): string | null {
	if (change.detail === null) {
		return change.summary;
	}

	return describeConfigChangeDetail(change.detail, t);
}

// An alert rule is named after its kind; everything else by the name it had then.
export function configChangeSubject(change: Pick<ConfigChangeEvent, 'detail' | 'entityName'>, t: TranslateFn): string | null {
	if (change.detail?.kind === 'alert_rule') {
		return t(ALERT_KIND_LABEL_KEYS[change.detail.alertKind]);
	}

	return change.entityName;
}

function isStrategy(value: AuditValue): value is LoadBalancingStrategy {
	return typeof value === 'string' && value in STRATEGY_LABEL_KEY;
}

function formatEmptyValue(field: string, t: TranslateFn): string {
	if (EMPTY_MEANS_ALL.has(field)) {
		return t(`${PREFIX}.value.all`);
	}

	if (NULL_MEANS_UNLIMITED.has(field)) {
		return t(`${PREFIX}.value.unlimited`);
	}

	return t(`${PREFIX}.value.none`);
}

function formatValue(field: string, value: AuditValue, t: TranslateFn): string {
	if (value === null) {
		return formatEmptyValue(field, t);
	}

	if (Array.isArray(value)) {
		return value.length === 0 ? formatEmptyValue(field, t) : value.join(LIST_SEPARATOR);
	}

	if (typeof value === 'boolean') {
		return t(value ? `${PREFIX}.value.yes` : `${PREFIX}.value.no`);
	}

	if (field === 'lbStrategy' && isStrategy(value)) {
		return t(STRATEGY_LABEL_KEY[value]);
	}

	const isDuration = field.endsWith(MILLISECONDS_SUFFIX) && typeof value === 'number';

	if (isDuration) {
		return t(`${PREFIX}.value.ms`, { value });
	}

	return String(value);
}

// A field without a label shows its own name: better than hiding the change.
function fieldLabel(field: string, t: TranslateFn): string {
	const key = `${PREFIX}.field.${field}`;
	const label = t(key);

	return label === key ? field : label;
}

function describeField(change: FieldChange, t: TranslateFn): string {
	const before = formatValue(change.field, change.before, t);
	const after = formatValue(change.field, change.after, t);

	return `${fieldLabel(change.field, t)}: ${before} → ${after}`;
}

function describeChaos(detail: Extract<ConfigChangeDetail, { kind: 'chaos' }>, t: TranslateFn): string {
	const faults = [
		detail.latencyMs > 0 ? t(`${PREFIX}.chaos.latency`, { latencyMs: detail.latencyMs }) : null,
		detail.jitterMs > 0 ? t(`${PREFIX}.chaos.jitter`, { jitterMs: detail.jitterMs }) : null,
		detail.errorRate > 0 ? t(`${PREFIX}.chaos.errors`, { percent: Math.round(detail.errorRate * PERCENT_FACTOR) }) : null,
		detail.isDown ? t(`${PREFIX}.chaos.down`) : null,
	].filter((fault): fault is string => fault !== null);

	if (faults.length === 0) {
		return t(`${PREFIX}.chaos.cleared`);
	}

	return t(`${PREFIX}.chaos.applied`, { faults: faults.join(LIST_SEPARATOR) });
}

function describeAlertRule(detail: Extract<ConfigChangeDetail, { kind: 'alert_rule' }>, t: TranslateFn): string {
	if (!detail.isEnabled) {
		return t(`${PREFIX}.alertRule.disabled`);
	}

	if (detail.threshold === null) {
		return t(`${PREFIX}.alertRule.enabled`, { count: detail.sustainedWindows });
	}

	return t(`${PREFIX}.alertRule.enabledWithThreshold`, { threshold: detail.threshold, count: detail.sustainedWindows });
}
