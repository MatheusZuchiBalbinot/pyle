import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/control-plane-client';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';

// Batched so a purge never holds a long lock on tables the gateways write to.
const RETENTION_DELETE_BATCH_SIZE = 10_000;

// Tables purged by time in batches; names are constants, never input.
const BATCHED_TABLES = {
	RouteInstanceSample: Prisma.sql`"RouteInstanceSample"`,
	RouteConsumerSample: Prisma.sql`"RouteConsumerSample"`,
} as const;

// Separate from the feature repositories: those hide soft-deleted rows, which is what a
// purge needs.
@Injectable()
export class DataRetentionRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	async deleteReadNotificationsBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.adminNotification.deleteMany({ where: { readAt: { not: null, lt: cutoff } } });

		return result.count;
	}

	async deleteSystemHealthEventsBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.systemHealthEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });

		return result.count;
	}

	async deleteTrafficSamplesBefore(cutoff: Date): Promise<number> {
		const instanceSamples = await this.deleteInBatches(BATCHED_TABLES.RouteInstanceSample, cutoff);
		const consumerSamples = await this.deleteInBatches(BATCHED_TABLES.RouteConsumerSample, cutoff);

		return instanceSamples + consumerSamples;
	}

	async deleteInstanceStateEventsBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.instanceStateEvent.deleteMany({ where: { occurredAt: { lt: cutoff } } });

		return result.count;
	}

	// Open alerts are never purged, however old.
	async deleteResolvedAlertsBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.gatewayAlert.deleteMany({ where: { resolvedAt: { not: null, lt: cutoff } } });

		return result.count;
	}

	async deleteExpiredRefreshTokensBefore(cutoff: Date): Promise<number> {
		const result = await this.prisma.adminRefreshToken.deleteMany({ where: { expiresAt: { lt: cutoff } } });

		return result.count;
	}

	private async deleteInBatches(table: Prisma.Sql, cutoff: Date): Promise<number> {
		let total = 0;

		for (;;) {
			const deleted = await this.prisma.$executeRaw`
				DELETE FROM ${table} WHERE id IN (SELECT id FROM ${table} WHERE "bucketStart" < ${cutoff} LIMIT ${RETENTION_DELETE_BATCH_SIZE})`;

			total += deleted;

			if (deleted < RETENTION_DELETE_BATCH_SIZE) {
				return total;
			}
		}
	}
}
