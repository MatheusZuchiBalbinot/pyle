import { Injectable } from '@nestjs/common';
import { Prisma, type GatewayAlert } from '@prisma/control-plane-client';

import { toPage, type Page, type PageRequest } from '../../../common/pagination.js';
import { ControlPlanePrismaService } from '../../../control-plane/prisma/control-plane-prisma.service.js';
import { isUniqueViolation } from '../../../gateway-config/domain/unique-violation.js';
import type { AlertToOpen } from '../domain/evaluate-alert-rules.js';

// Open alerts are bounded by the number of routes and instances (one per
// kind and subject), well under this.
const MAX_OPEN_ALERTS = 500;

@Injectable()
export class GatewayAlertRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	listOpen(): Promise<readonly GatewayAlert[]> {
		return this.prisma.gatewayAlert.findMany({
			where: { resolvedAt: null },
			orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }],
			take: MAX_OPEN_ALERTS,
		});
	}

	async listPage(page: PageRequest): Promise<Page<GatewayAlert>> {
		const where: Prisma.GatewayAlertWhereInput = page.cursor
			? {
					OR: [{ triggeredAt: { lt: page.cursor.orderedAt } }, { triggeredAt: page.cursor.orderedAt, id: { lt: page.cursor.id } }],
				}
			: {};
		const rows = await this.prisma.gatewayAlert.findMany({ where, orderBy: [{ triggeredAt: 'desc' }, { id: 'desc' }], take: page.limit + 1 });

		return toPage(rows, page.limit, (row) => ({ orderedAt: row.triggeredAt, id: row.id }));
	}

	// Null when an open alert of the same kind and subject exists already
	// (the partial unique index decides, so concurrent evaluators agree).
	async openIfNone(alert: AlertToOpen, triggeredAt: Date): Promise<GatewayAlert | null> {
		const { kind, severity, subjectType, subjectId, message } = alert;

		try {
			return await this.prisma.gatewayAlert.create({ data: { kind, severity, subjectType, subjectId, message, triggeredAt } });
		} catch (error) {
			if (isUniqueViolation(error)) {
				return null;
			}

			throw error;
		}
	}

	// False when someone resolved it first.
	async resolve(id: string, resolvedAt: Date): Promise<boolean> {
		const result = await this.prisma.gatewayAlert.updateMany({ where: { id, resolvedAt: null }, data: { resolvedAt } });

		return result.count > 0;
	}
}
