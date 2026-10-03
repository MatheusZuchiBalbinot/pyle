import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import type { ConfigActivityService } from '../../../gateway-config/application/config-activity.service.js';
import type { AlertRuleConfigService } from '../../../traffic/alerts/application/alert-rule-config.service.js';
import type { GatewayAlertService } from '../../../traffic/alerts/application/gateway-alert.service.js';
import type { RequestLogReader } from '../../../traffic/infrastructure/request-log.reader.js';
import { NO_INPUT_SCHEMA, type AiTool } from '../ai-tool.js';
import { readBoundedInteger, readOptionalString, toJson } from './tool-inputs.js';

const ERROR_GROUPS = { min: 1, max: 50, fallback: 20 } as const;
const SINCE_MINUTES = { min: 1, max: 1440, fallback: 60 } as const;
const SERVER_ERROR_FLOOR = 500;
// Error entries gathered before grouping: plenty for a pattern.
const MAX_ERROR_ENTRIES = 500;
const MAX_CHANGES = 100;
const MS_PER_MINUTE = 60_000;

export type DiagnosticsToolDependencies = {
	readonly requestLog: RequestLogReader;
	readonly maxLogEntries: number;
	readonly activity: ConfigActivityService;
	readonly alerts: GatewayAlertService;
	readonly rules: AlertRuleConfigService;
	readonly now: () => number;
};

type ErrorGroup = { route: string; instance: string; status: number; gatewayError: string | null; count: number; lastAt: string };

// Grouped by (route, instance, status, gateway code): "orders-2 answered
// 503 forty times" reads better than forty lines.
export function groupErrors(entries: readonly RequestLogEntry[]): readonly ErrorGroup[] {
	const groups = new Map<string, ErrorGroup>();

	for (const entry of entries) {
		const key = `${entry.routeName}|${entry.instanceName}|${entry.status}|${entry.gatewayError}`;
		const group = groups.get(key);

		if (group) {
			group.count++;
			continue;
		}

		groups.set(key, {
			route: entry.routeName ?? '(no route)',
			instance: entry.instanceName ?? '(gateway)',
			status: entry.status,
			gatewayError: entry.gatewayError,
			count: 1,
			lastAt: entry.at,
		});
	}

	return [...groups.values()].sort((left, right) => right.count - left.count);
}

export function buildDiagnosticsTools(dependencies: DiagnosticsToolDependencies): readonly AiTool[] {
	return [
		recentErrorsTool(dependencies),
		configChangesTool(dependencies),
		{
			name: 'get_open_alerts',
			description: 'Alerts open now (route latency and error rate, unhealthy instances, open circuits).',
			inputSchema: NO_INPUT_SCHEMA,
			run: async () => toJson(await dependencies.alerts.listOpen()),
		},
		{
			name: 'get_alert_rules',
			description: 'The four alert rules: enabled, threshold, sustained windows.',
			inputSchema: NO_INPUT_SCHEMA,
			run: async () => toJson(await dependencies.rules.listAll()),
		},
	];
}

function isError(entry: RequestLogEntry): boolean {
	return entry.status >= SERVER_ERROR_FLOOR || entry.gatewayError !== null;
}

function recentErrorsTool(dependencies: DiagnosticsToolDependencies): AiTool {
	return {
		name: 'get_recent_errors',
		description:
			'Recent server errors (5xx) and gateway-made failures from the request log, grouped by route, instance, status and gateway code, most frequent first.',
		inputSchema: {
			type: 'object',
			properties: { routeId: { type: 'string' }, limit: { type: 'integer', minimum: ERROR_GROUPS.min, maximum: ERROR_GROUPS.max } },
			required: [],
			additionalProperties: false,
		},
		run: async (input) => {
			const routeId = readOptionalString(input, 'routeId');
			const limit = readBoundedInteger(input, 'limit', ERROR_GROUPS);
			const matches = (entry: RequestLogEntry): boolean => isError(entry) && (routeId === undefined || entry.routeId === routeId);
			const scan = await dependencies.requestLog.scan({ startIndex: 0, limit: MAX_ERROR_ENTRIES, maxScanned: dependencies.maxLogEntries, matches });

			return toJson({ sampledEntries: scan.entries.length, groups: groupErrors(scan.entries).slice(0, limit) });
		},
	};
}

function configChangesTool(dependencies: DiagnosticsToolDependencies): AiTool {
	return {
		name: 'get_config_changes',
		description: 'Configuration changes (who changed what, when), newest first: correlate them with a change in latency or errors.',
		inputSchema: {
			type: 'object',
			properties: {
				sinceMinutes: { type: 'integer', minimum: SINCE_MINUTES.min, maximum: SINCE_MINUTES.max },
				entityType: { type: 'string', enum: ['service', 'instance', 'route', 'consumer', 'api_key', 'alert_rule'] },
			},
			required: [],
			additionalProperties: false,
		},
		run: async (input) => {
			const since = new Date(dependencies.now() - readBoundedInteger(input, 'sinceMinutes', SINCE_MINUTES) * MS_PER_MINUTE);
			const entityType = readOptionalString(input, 'entityType');
			const changes = await dependencies.activity.listRecent(since, MAX_CHANGES);

			return toJson(changes.filter((change) => entityType === undefined || change.entityType === entityType));
		},
	};
}
