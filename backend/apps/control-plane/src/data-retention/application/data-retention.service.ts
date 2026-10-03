import { Injectable, Logger } from '@nestjs/common';

import { getReadNotificationRetentionDays, getSystemHealthEventRetentionDays } from '../../config/data-retention.js';
import { getConsumerPurgeAfterDays, getTrafficRetentionHours } from '../../config/traffic.js';
import { ConsumerPurgeService } from '../../gateway-config/application/consumer-purge.service.js';
import { DataRetentionRepository } from '../infrastructure/data-retention.repository.js';

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

type RetentionPassResult = {
	readonly purgedConsumerSlugs: readonly string[];
	readonly deletedNotificationCount: number;
	readonly deletedHealthEventCount: number;
	readonly deletedRefreshTokenCount: number;
	readonly deletedTrafficSampleCount: number;
	readonly deletedInstanceStateEventCount: number;
	readonly deletedResolvedAlertCount: number;
};

// Every table that grows without bound has an explicit policy here.
@Injectable()
export class DataRetentionService {
	private readonly logger = new Logger(DataRetentionService.name);

	constructor(
		private readonly repository: DataRetentionRepository,
		private readonly consumerPurge: ConsumerPurgeService,
	) {}

	async runPass(now: Date = new Date()): Promise<RetentionPassResult> {
		// A soft-deleted consumer is kept long enough to undo a mistaken
		// deletion; its traffic history stays after the purge.
		const purgedConsumerSlugs = await this.consumerPurge.purgeDeletedBefore(cutoffDaysAgo(getConsumerPurgeAfterDays(), now));
		const trafficCutoff = cutoffHoursAgo(getTrafficRetentionHours(), now);
		const historyCutoff = cutoffDaysAgo(getSystemHealthEventRetentionDays(), now);
		const [deletedNotificationCount, deletedHealthEventCount, deletedRefreshTokenCount] = await Promise.all([
			this.repository.deleteReadNotificationsBefore(cutoffDaysAgo(getReadNotificationRetentionDays(), now)),
			this.repository.deleteSystemHealthEventsBefore(historyCutoff),
			// Revoked but unexpired tokens stay: they make token reuse detectable.
			this.repository.deleteExpiredRefreshTokensBefore(now),
		]);
		// Nothing older than the retention can be asked for anyway.
		const [deletedTrafficSampleCount, deletedInstanceStateEventCount, deletedResolvedAlertCount] = await Promise.all([
			this.repository.deleteTrafficSamplesBefore(trafficCutoff),
			this.repository.deleteInstanceStateEventsBefore(trafficCutoff),
			this.repository.deleteResolvedAlertsBefore(historyCutoff),
		]);

		const result: RetentionPassResult = {
			purgedConsumerSlugs,
			deletedNotificationCount,
			deletedHealthEventCount,
			deletedRefreshTokenCount,
			deletedTrafficSampleCount,
			deletedInstanceStateEventCount,
			deletedResolvedAlertCount,
		};

		this.logPass(result);

		return result;
	}

	private logPass(result: RetentionPassResult): void {
		const deletedCounts = [
			result.deletedNotificationCount,
			result.deletedHealthEventCount,
			result.deletedRefreshTokenCount,
			result.deletedTrafficSampleCount,
			result.deletedInstanceStateEventCount,
			result.deletedResolvedAlertCount,
		];
		const hasWork = result.purgedConsumerSlugs.length + deletedCounts.reduce((sum, count) => sum + count, 0) > 0;

		if (!hasWork) {
			return;
		}

		this.logger.log(
			`Retention pass: purged ${result.purgedConsumerSlugs.length} consumer(s), ${result.deletedNotificationCount} read notification(s), ` +
				`${result.deletedHealthEventCount} health event(s), ${result.deletedRefreshTokenCount} expired refresh token(s), ` +
				`${result.deletedTrafficSampleCount} traffic sample(s), ${result.deletedInstanceStateEventCount} instance state event(s), ` +
				`${result.deletedResolvedAlertCount} resolved alert(s)`,
		);
	}
}

function cutoffDaysAgo(days: number, now: Date): Date {
	return new Date(now.getTime() - days * MS_PER_DAY);
}

function cutoffHoursAgo(hours: number, now: Date): Date {
	return new Date(now.getTime() - hours * MS_PER_HOUR);
}
