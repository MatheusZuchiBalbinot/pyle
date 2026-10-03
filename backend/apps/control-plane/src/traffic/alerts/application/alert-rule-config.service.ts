import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { GatewayAlertKind } from '@prisma/control-plane-client';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { ControlPlanePrismaService } from '../../../control-plane/prisma/control-plane-prisma.service.js';
import { ConfigChangeRecorder, type ConfigActor, type ConfigChange } from '../../../gateway-config/application/config-change-recorder.js';
import type { ConfigChangeDetail } from '../../../gateway-config/domain/config-change-detail.js';
import { ConfigValidationError } from '../../../gateway-config/domain/config-errors.js';
import { ALERT_RULE_KINDS, DEFAULT_ALERT_RULES, isAlertRuleKind, THRESHOLD_BOUNDS_BY_KIND } from '../domain/alert-rule-kinds.js';
import type { AlertRules } from '../domain/evaluate-alert-rules.js';
import { AlertRuleConfigRepository, type AlertRuleSettings } from '../infrastructure/alert-rule-config.repository.js';
import { toAlertRuleConfigDto, type AlertRuleConfigDto } from '../interface/dto/alert-rule-config.dto.js';

@Injectable()
export class AlertRuleConfigService implements OnModuleInit {
	private readonly logger = new Logger(AlertRuleConfigService.name);

	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly repository: AlertRuleConfigRepository,
		private readonly recorder: ConfigChangeRecorder,
	) {}

	// Best effort: if the database is not up yet, the evaluator uses the defaults until the
	// next boot.
	async onModuleInit(): Promise<void> {
		const defaults = ALERT_RULE_KINDS.map((kind) => ({ kind, ...DEFAULT_ALERT_RULES[kind] }));

		try {
			const created = await this.repository.ensureRows(defaults);

			if (created > 0) {
				this.logger.log(`Created ${created} default alert rule(s)`);
			}
		} catch (error) {
			this.logger.warn(`Could not create the default alert rules: ${toErrorMessage(error)}`);
		}
	}

	async listAll(): Promise<readonly AlertRuleConfigDto[]> {
		const rules = await this.rules();

		return ALERT_RULE_KINDS.map((kind) => ({ kind, ...rules[kind] }));
	}

	async rules(): Promise<AlertRules> {
		const rows = await this.repository.listAll();
		const byKind = new Map(rows.map((row) => [row.kind, toAlertRuleConfigDto(row)]));
		const entries = ALERT_RULE_KINDS.map((kind) => {
			const row = byKind.get(kind);
			const rule = row ? { isEnabled: row.isEnabled, threshold: row.threshold, sustainedWindows: row.sustainedWindows } : DEFAULT_ALERT_RULES[kind];

			return [kind, rule] as const;
		});

		return Object.fromEntries(entries) as AlertRules;
	}

	async update(kind: string, settings: AlertRuleSettings, actor: ConfigActor): Promise<AlertRuleConfigDto> {
		if (!isAlertRuleKind(kind)) {
			throw new ConfigValidationError(`Unknown alert rule kind "${kind}"; must be one of ${ALERT_RULE_KINDS.join(', ')}`);
		}

		assertThreshold(kind, settings.threshold);
		const { row, change } = await this.prisma.$transaction(async (transaction) => {
			const updated = await this.repository.upsert(kind, settings, transaction);
			const detail: ConfigChangeDetail = { kind: 'alert_rule', alertKind: kind, ...settings };
			const recorded: ConfigChange = { entityType: 'alert_rule', entityId: updated.id, entityName: kind, action: 'updated', detail };

			await this.recorder.record(recorded, actor, transaction);

			return { row: updated, change: recorded };
		});

		await this.recorder.announce([change]);

		return toAlertRuleConfigDto(row);
	}
}

// A threshold must fit its kind: none for the instance kinds, within range
// for the route kinds.
function assertThreshold(kind: GatewayAlertKind, threshold: number | null): void {
	const bounds = THRESHOLD_BOUNDS_BY_KIND[kind];

	if (bounds === null) {
		if (threshold !== null) {
			throw new ConfigValidationError(`The ${kind} rule takes no threshold`);
		}

		return;
	}

	if (threshold === null) {
		throw new ConfigValidationError(`The ${kind} rule needs a threshold`);
	}

	const isInRange = threshold >= bounds.min && threshold <= bounds.max;

	if (!isInRange) {
		throw new ConfigValidationError(`The ${kind} threshold must be between ${bounds.min} and ${bounds.max}`);
	}
}
