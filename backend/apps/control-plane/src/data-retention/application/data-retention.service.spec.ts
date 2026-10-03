import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ConsumerPurgeService } from '../../gateway-config/application/consumer-purge.service.js';
import type { DataRetentionRepository } from '../infrastructure/data-retention.repository.js';
import { DataRetentionService } from './data-retention.service.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-22T12:00:00.000Z');

function buildService(overrides: Partial<DataRetentionRepository> = {}) {
	const repository = {
		deleteReadNotificationsBefore: vi.fn().mockResolvedValue(0),
		deleteSystemHealthEventsBefore: vi.fn().mockResolvedValue(0),
		deleteExpiredRefreshTokensBefore: vi.fn().mockResolvedValue(0),
		deleteTrafficSamplesBefore: vi.fn().mockResolvedValue(0),
		deleteInstanceStateEventsBefore: vi.fn().mockResolvedValue(0),
		deleteResolvedAlertsBefore: vi.fn().mockResolvedValue(0),
		...overrides,
	} as unknown as DataRetentionRepository;
	const consumerPurge = { purgeDeletedBefore: vi.fn().mockResolvedValue([]) } as unknown as ConsumerPurgeService;

	return { service: new DataRetentionService(repository, consumerPurge), repository, consumerPurge };
}

describe('DataRetentionService', () => {
	beforeEach(() => {
		process.env.READ_NOTIFICATION_RETENTION_DAYS = '90';
		process.env.SYSTEM_HEALTH_EVENT_RETENTION_DAYS = '180';
		process.env.CONSUMER_PURGE_AFTER_DAYS = '30';
		process.env.TRAFFIC_RETENTION_HOURS = '24';
	});
	afterEach(() => {
		delete process.env.READ_NOTIFICATION_RETENTION_DAYS;
		delete process.env.SYSTEM_HEALTH_EVENT_RETENTION_DAYS;
		delete process.env.CONSUMER_PURGE_AFTER_DAYS;
		delete process.env.TRAFFIC_RETENTION_HOURS;
		vi.clearAllMocks();
	});

	it('purges read notifications and health events by their own windows, and expired refresh tokens', async () => {
		const { service, repository } = buildService({
			deleteReadNotificationsBefore: vi.fn().mockResolvedValue(5),
			deleteSystemHealthEventsBefore: vi.fn().mockResolvedValue(2),
			deleteExpiredRefreshTokensBefore: vi.fn().mockResolvedValue(9),
		});

		const result = await service.runPass(NOW);

		expect(repository.deleteReadNotificationsBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * MS_PER_DAY));
		expect(repository.deleteSystemHealthEventsBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 180 * MS_PER_DAY));
		// Expired means unusable: there is nothing left to detect reuse of.
		expect(repository.deleteExpiredRefreshTokensBefore).toHaveBeenCalledWith(NOW);
		expect(result).toEqual(expect.objectContaining({ deletedNotificationCount: 5, deletedHealthEventCount: 2, deletedRefreshTokenCount: 9 }));
	});

	it('purges traffic history by the traffic retention, and resolved alerts with health events', async () => {
		const { service, repository } = buildService({
			deleteTrafficSamplesBefore: vi.fn().mockResolvedValue(20_000),
			deleteInstanceStateEventsBefore: vi.fn().mockResolvedValue(3),
			deleteResolvedAlertsBefore: vi.fn().mockResolvedValue(1),
		});

		const result = await service.runPass(NOW);

		const trafficCutoff = new Date(NOW.getTime() - MS_PER_DAY);

		expect(repository.deleteTrafficSamplesBefore).toHaveBeenCalledWith(trafficCutoff);
		expect(repository.deleteInstanceStateEventsBefore).toHaveBeenCalledWith(trafficCutoff);
		expect(repository.deleteResolvedAlertsBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 180 * MS_PER_DAY));
		expect(result).toEqual(
			expect.objectContaining({ deletedTrafficSampleCount: 20_000, deletedInstanceStateEventCount: 3, deletedResolvedAlertCount: 1 }),
		);
	});

	it('purges consumers deleted before their own window', async () => {
		const { service, consumerPurge } = buildService();

		vi.mocked(consumerPurge.purgeDeletedBefore).mockResolvedValue(['old-app']);

		const result = await service.runPass(NOW);

		expect(consumerPurge.purgeDeletedBefore).toHaveBeenCalledWith(new Date(NOW.getTime() - 30 * MS_PER_DAY));
		expect(result.purgedConsumerSlugs).toEqual(['old-app']);
	});

	it('does nothing when nothing has expired', async () => {
		const { service } = buildService();

		const result = await service.runPass(NOW);

		expect(result).toEqual({
			purgedConsumerSlugs: [],
			deletedNotificationCount: 0,
			deletedHealthEventCount: 0,
			deletedRefreshTokenCount: 0,
			deletedTrafficSampleCount: 0,
			deletedInstanceStateEventCount: 0,
			deletedResolvedAlertCount: 0,
		});
	});
});
