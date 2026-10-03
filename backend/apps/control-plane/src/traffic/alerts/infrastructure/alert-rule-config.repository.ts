import { Injectable } from '@nestjs/common';
import type { AlertRuleConfig, GatewayAlertKind } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../../control-plane/prisma/control-plane-prisma.service.js';
import type { PrismaExecutor } from '../../../gateway-config/infrastructure/prisma-client.js';
import type { AlertRuleDefaults } from '../domain/alert-rule-kinds.js';

export type AlertRuleSettings = {
	readonly isEnabled: boolean;
	readonly threshold: number | null;
	readonly sustainedWindows: number;
};

@Injectable()
export class AlertRuleConfigRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	listAll(): Promise<readonly AlertRuleConfig[]> {
		return this.prisma.alertRuleConfig.findMany({ orderBy: { kind: 'asc' } });
	}

	// Creates the missing kinds only; existing rows keep their values.
	async ensureRows(defaults: readonly (AlertRuleDefaults & { readonly kind: GatewayAlertKind })[]): Promise<number> {
		const result = await this.prisma.alertRuleConfig.createMany({ data: [...defaults], skipDuplicates: true });

		return result.count;
	}

	upsert(kind: GatewayAlertKind, settings: AlertRuleSettings, executor: PrismaExecutor = this.prisma): Promise<AlertRuleConfig> {
		return executor.alertRuleConfig.upsert({ where: { kind }, create: { kind, ...settings }, update: settings });
	}
}
