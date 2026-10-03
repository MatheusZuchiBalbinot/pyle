import type {
	AlertRuleConfig,
	ConfigActivityFilter,
	ConfigChangeEvent,
	GatewayAlert,
	GatewayAlertKind,
	Page,
	PageQuery,
	UpdateAlertRuleConfigInput,
} from '../adminApiTypes';
import { appendPageQuery, jsonBody, requestJson, toQuery } from './request';

export function listOpenAlerts(): Promise<readonly GatewayAlert[]> {
	return requestJson('/admin/alerts/open');
}

export function listConfigActivity(filter: ConfigActivityFilter, page: PageQuery = {}): Promise<Page<ConfigChangeEvent>> {
	const params = new URLSearchParams();

	if (filter.entityType) {
		params.set('entityType', filter.entityType);
	}

	if (filter.entityId) {
		params.set('entityId', filter.entityId);
	}

	appendPageQuery(params, page);

	return requestJson(`/admin/activity${toQuery(params)}`);
}

export function getAlertRules(): Promise<readonly AlertRuleConfig[]> {
	return requestJson('/admin/alert-rules');
}

export function updateAlertRule(kind: GatewayAlertKind, input: UpdateAlertRuleConfigInput): Promise<AlertRuleConfig> {
	return requestJson(`/admin/alert-rules/${kind}`, jsonBody('PUT', input));
}
