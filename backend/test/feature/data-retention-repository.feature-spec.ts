import { Test, type TestingModule } from '@nestjs/testing';

import { emptyHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { DataRetentionRepository } from '../../apps/control-plane/src/data-retention/infrastructure/data-retention.repository.js';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const LONG_AGO = new Date(Date.now() - 400 * MS_PER_DAY);
const RECENTLY = new Date(Date.now() - 1 * MS_PER_DAY);
const RETENTION_CUTOFF = new Date(Date.now() - 30 * MS_PER_DAY);

describe('data retention repository (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let repository: DataRetentionRepository;

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		repository = moduleFixture.get(DataRetentionRepository, { strict: false });
	});

	afterAll(async () => {
		await moduleFixture.close();
	});

	describe('time-based cleanups', () => {
		it('deletes read notifications older than the cutoff and keeps unread and recent ones', async () => {
			const oldRead = await prisma.adminNotification.create({
				data: { category: 'system', severity: 'info', eventType: 'retention.old.read', payload: {}, createdAt: LONG_AGO, readAt: LONG_AGO },
			});
			const oldUnread = await prisma.adminNotification.create({
				data: { category: 'system', severity: 'info', eventType: 'retention.old.unread', payload: {}, createdAt: LONG_AGO },
			});
			const recentRead = await prisma.adminNotification.create({
				data: { category: 'system', severity: 'info', eventType: 'retention.recent.read', payload: {}, readAt: RECENTLY },
			});

			const deletedCount = await repository.deleteReadNotificationsBefore(RETENTION_CUTOFF);

			expect(deletedCount).toBeGreaterThanOrEqual(1);
			expect(await prisma.adminNotification.findUnique({ where: { id: oldRead.id } })).toBeNull();
			expect(await prisma.adminNotification.findUnique({ where: { id: oldUnread.id } })).not.toBeNull();
			expect(await prisma.adminNotification.findUnique({ where: { id: recentRead.id } })).not.toBeNull();
			await prisma.adminNotification.deleteMany({ where: { id: { in: [oldUnread.id, recentRead.id] } } });
		});

		it('deletes health events older than the cutoff and keeps the recent history', async () => {
			const oldEvent = await prisma.systemHealthEvent.create({ data: { component: 'control_plane_redis', status: 'down', occurredAt: LONG_AGO } });
			const recentEvent = await prisma.systemHealthEvent.create({ data: { component: 'control_plane_redis', status: 'up', occurredAt: RECENTLY } });

			const deletedCount = await repository.deleteSystemHealthEventsBefore(RETENTION_CUTOFF);

			expect(deletedCount).toBeGreaterThanOrEqual(1);
			expect(await prisma.systemHealthEvent.findUnique({ where: { id: oldEvent.id } })).toBeNull();
			expect(await prisma.systemHealthEvent.findUnique({ where: { id: recentEvent.id } })).not.toBeNull();
			await prisma.systemHealthEvent.delete({ where: { id: recentEvent.id } });
		});

		it('deletes refresh tokens that expired before the cutoff and keeps the live ones', async () => {
			const user = await prisma.adminUser.create({
				data: { email: `retention-${Date.now()}@pyle.local`, name: 'Retention', passwordHash: 'scrypt$x' },
			});
			const expiredToken = await prisma.adminRefreshToken.create({
				data: { userId: user.id, tokenHash: `expired-${Date.now()}`, expiresAt: LONG_AGO },
			});
			const liveToken = await prisma.adminRefreshToken.create({
				data: { userId: user.id, tokenHash: `live-${Date.now()}`, expiresAt: new Date(Date.now() + MS_PER_DAY) },
			});

			const deletedCount = await repository.deleteExpiredRefreshTokensBefore(RETENTION_CUTOFF);

			expect(deletedCount).toBeGreaterThanOrEqual(1);
			expect(await prisma.adminRefreshToken.findUnique({ where: { id: expiredToken.id } })).toBeNull();
			expect(await prisma.adminRefreshToken.findUnique({ where: { id: liveToken.id } })).not.toBeNull();
			await prisma.adminRefreshToken.deleteMany({ where: { userId: user.id } });
			await prisma.adminUser.delete({ where: { id: user.id } });
		});
	});

	describe('traffic history', () => {
		const run = `retention-${Date.now()}`;

		function sample(suffix: string, bucketStart: Date) {
			const counts = {
				requestCount: 1,
				status2xx: 1,
				status3xx: 0,
				status4xx: 0,
				status5xx: 0,
				rateLimitedCount: 0,
				gatewayErrorCount: 0,
				retryCount: 0,
			};

			return {
				flushKey: `${run}-${suffix}`,
				gatewayId: run,
				bucketStart,
				routeId: null,
				instanceId: null,
				...counts,
				latencyBuckets: emptyHistogram(),
				latencySumMs: 1,
			};
		}

		it('deletes samples of both tables older than the cutoff, in batches, and keeps the recent ones', async () => {
			await prisma.routeInstanceSample.createMany({ data: [sample('old-1', LONG_AGO), sample('old-2', LONG_AGO), sample('recent', RECENTLY)] });
			const consumerSample = {
				flushKey: `${run}-consumer-old`,
				gatewayId: run,
				bucketStart: LONG_AGO,
				routeId: null,
				consumerId: null,
				requestCount: 1,
				status4xx: 0,
				status5xx: 0,
				rateLimitedCount: 0,
				latencyBuckets: emptyHistogram(),
				latencySumMs: 1,
			};

			await prisma.routeConsumerSample.create({ data: consumerSample });

			const deletedCount = await repository.deleteTrafficSamplesBefore(RETENTION_CUTOFF);

			expect(deletedCount).toBeGreaterThanOrEqual(3);
			expect((await prisma.routeInstanceSample.findMany({ where: { gatewayId: run } })).map((row) => row.flushKey)).toEqual([`${run}-recent`]);
			expect(await prisma.routeConsumerSample.count({ where: { gatewayId: run } })).toBe(0);
			await prisma.routeInstanceSample.deleteMany({ where: { gatewayId: run } });
		});

		it('deletes old instance state events, and resolved alerts but never open ones', async () => {
			const event = { instanceId: run, gatewayId: run, kind: 'health', fromState: 'healthy', toState: 'unhealthy', reason: 'test' } as const;

			await prisma.instanceStateEvent.createMany({
				data: [
					{ ...event, occurredAt: LONG_AGO },
					{ ...event, occurredAt: RECENTLY },
				],
			});
			const alert = { kind: 'instance_unhealthy', severity: 'critical', subjectType: 'instance', message: 'test', triggeredAt: LONG_AGO } as const;
			const resolved = await prisma.gatewayAlert.create({ data: { ...alert, subjectId: `${run}-resolved`, resolvedAt: LONG_AGO } });
			const open = await prisma.gatewayAlert.create({ data: { ...alert, subjectId: `${run}-open` } });

			await repository.deleteInstanceStateEventsBefore(RETENTION_CUTOFF);
			await repository.deleteResolvedAlertsBefore(RETENTION_CUTOFF);

			expect(await prisma.instanceStateEvent.count({ where: { gatewayId: run } })).toBe(1);
			expect(await prisma.gatewayAlert.findUnique({ where: { id: resolved.id } })).toBeNull();
			expect(await prisma.gatewayAlert.findUnique({ where: { id: open.id } })).not.toBeNull();
			await prisma.instanceStateEvent.deleteMany({ where: { gatewayId: run } });
			await prisma.gatewayAlert.delete({ where: { id: open.id } });
		});
	});
});
