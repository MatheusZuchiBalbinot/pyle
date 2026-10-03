import { Injectable, Logger } from '@nestjs/common';

import { readGatewayConfig } from '@pyle/shared/config/gateway.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { ConfigActivityService } from '../../gateway-config/application/config-activity.service.js';
import { ConsumersService } from '../../gateway-config/application/consumers.service.js';
import { RoutesService } from '../../gateway-config/application/routes.service.js';
import { ServicesService } from '../../gateway-config/application/services.service.js';
import { SystemHealthService } from '../../system-health/application/system-health.service.js';
import { AlertRuleConfigService } from '../../traffic/alerts/application/alert-rule-config.service.js';
import { GatewayAlertService } from '../../traffic/alerts/application/gateway-alert.service.js';
import { TrafficQueryService } from '../../traffic/application/traffic-query.service.js';
import { InstanceStateEventRepository } from '../../traffic/infrastructure/instance-state-event.repository.js';
import { RequestLogReader } from '../../traffic/infrastructure/request-log.reader.js';
import { TrafficNamesRepository } from '../../traffic/infrastructure/traffic-names.repository.js';
import { ANALYSIS_SCOPES } from '../domain/analysis-scope.js';
import { AiAnalysisRepository, type ListAnalysesFilter } from '../infrastructure/ai-analysis.repository.js';
import { toAiAnalysisDto } from '../interface/dto/ai-analysis.dto.js';
import { buildDiagnosticsTools } from './tools/diagnostics-tools.js';
import { buildInstanceTools } from './tools/instance-tools.js';
import { readBoundedInteger, readOptionalString, toJson } from './tools/tool-inputs.js';
import { buildTrafficTools } from './tools/traffic-tools.js';
import type { AnalysisSubject } from './ai-model-client.js';
import { NO_INPUT_SCHEMA, type AiTool } from './ai-tool.js';

const PREVIOUS_ANALYSES = { min: 1, max: 3, fallback: 3 } as const;

// The same tools serve analyses, their conversations and the assistant. Every tool answers
// compactly and never returns a secret.
@Injectable()
export class AnalysisToolFactory {
	private readonly logger = new Logger(AnalysisToolFactory.name);

	constructor(
		private readonly systemHealthService: SystemHealthService,
		private readonly analysisRepository: AiAnalysisRepository,
		private readonly traffic: TrafficQueryService,
		private readonly routes: RoutesService,
		private readonly services: ServicesService,
		private readonly consumers: ConsumersService,
		private readonly activity: ConfigActivityService,
		private readonly alerts: GatewayAlertService,
		private readonly rules: AlertRuleConfigService,
		private readonly requestLog: RequestLogReader,
		private readonly stateEvents: InstanceStateEventRepository,
		private readonly names: TrafficNamesRepository,
	) {}

	buildTools(subject: AnalysisSubject): readonly AiTool[] {
		const now = Date.now;

		return [
			...buildTrafficTools({ traffic: this.traffic, routes: this.routes, consumers: this.consumers, services: this.services }),
			...buildInstanceTools({ services: this.services, traffic: this.traffic, stateEvents: this.stateEvents, names: this.names, now }),
			...buildDiagnosticsTools({
				requestLog: this.requestLog,
				maxLogEntries: readGatewayConfig().requestLogMaxEntries,
				activity: this.activity,
				alerts: this.alerts,
				rules: this.rules,
				now,
			}),
			this.buildSystemHealthTool(),
			this.buildPreviousAnalysisTool(subject),
		];
	}

	// Defaults to the subject of the run (the whole gateway for the
	// assistant), so "has this improved?" needs no arguments.
	private buildPreviousAnalysisTool(subject: AnalysisSubject): AiTool {
		return {
			name: 'get_previous_analyses',
			description:
				'Recent saved analyses, newest first (at most 3), by default of the subject being discussed: compare what was said before with what the data shows now.',
			inputSchema: {
				type: 'object',
				properties: {
					scope: { type: 'string', enum: ANALYSIS_SCOPES },
					subjectId: { type: 'string', description: 'Route or service id for those scopes' },
					limit: { type: 'integer', minimum: PREVIOUS_ANALYSES.min, maximum: PREVIOUS_ANALYSES.max },
				},
				required: [],
				additionalProperties: false,
			},
			run: async (input) => {
				const scope = ANALYSIS_SCOPES.find((candidate) => candidate === readOptionalString(input, 'scope'));
				const subjectId = readOptionalString(input, 'subjectId') ?? (scope === undefined ? (subject?.id ?? null) : null);
				const filter: ListAnalysesFilter = { scope, subjectId };
				const analyses = await this.analysisRepository.listRecent(filter, readBoundedInteger(input, 'limit', PREVIOUS_ANALYSES));

				return toJson(
					analyses.map(toAiAnalysisDto).map(({ id, scope: analysisScope, subjectName, requestedAt, summary, riskLevel, trend }) => ({
						id,
						scope: analysisScope,
						subjectName,
						requestedAt,
						summary,
						riskLevel,
						trend,
					})),
				);
			},
		};
	}

	private buildSystemHealthTool(): AiTool {
		return {
			name: 'get_system_health',
			description:
				"The platform's own components (the control plane's Postgres and Redis, and the gateways' heartbeats): current status and the recent up/down transitions.",
			inputSchema: NO_INPUT_SCHEMA,
			run: async () => {
				const recentEvents = await this.readOrUnavailable('health history', () => this.systemHealthService.listRecentEvents());

				return toJson({ components: this.systemHealthService.getCurrentStatus(), recentEvents });
			},
		};
	}

	// An empty list would read as "there is nothing": the model would then
	// state it with confidence at exactly the moment the source failed.
	private async readOrUnavailable<T>(what: string, load: () => Promise<T>): Promise<T | { readonly unavailable: string }> {
		try {
			return await load();
		} catch (error) {
			this.logger.warn(`AI tool could not read ${what}: ${toErrorMessage(error)}`);

			return { unavailable: `${what} could not be read right now; this is not the same as there being none` };
		}
	}
}
