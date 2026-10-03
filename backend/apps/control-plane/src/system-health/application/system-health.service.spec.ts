import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { buildRealtimePublisherFake } from '../../realtime/application/realtime-publisher.fake.js';
import type { ContainerDriver } from '../../scaling/application/scaling-ports.js';
import type { GatewayStatusService } from '../../traffic/application/gateway-status.service.js';
import type { GatewayStatusEntryDto } from '../../traffic/domain/traffic-responses.js';
import type { SystemHealthEventRepository } from '../infrastructure/system-health-event.repository.js';
import { SystemHealthService, type RedisHealthProbe } from './system-health.service.js';

function gateway(gatewayId: string, isAlive = true): GatewayStatusEntryDto {
	const at = '2026-09-26T00:00:00.000Z';

	return { gatewayId, startedAt: at, configVersion: 1, isRateLimitDegraded: false, updatedAt: at, isAlive };
}

function statusOf(...gateways: GatewayStatusEntryDto[]) {
	return { gateways, configVersion: 1 };
}

function buildService(overrides: {
	readonly queryRaw?: ReturnType<typeof vi.fn>;
	readonly record?: ReturnType<typeof vi.fn>;
	readonly redisPing?: ReturnType<typeof vi.fn>;
	readonly gatewayStatus?: ReturnType<typeof vi.fn>;
	readonly isDockerReachable?: boolean;
}) {
	const prisma = { $queryRaw: overrides.queryRaw ?? vi.fn().mockResolvedValue([]) } as unknown as ControlPlanePrismaService;
	const eventRepository = {
		record: overrides.record ?? vi.fn().mockResolvedValue(undefined),
		listRecent: vi.fn().mockResolvedValue([]),
	} as unknown as SystemHealthEventRepository;

	const ping = overrides.redisPing ?? vi.fn().mockResolvedValue('PONG');
	const redis = { ping, disconnect: vi.fn() } as unknown as RedisHealthProbe;

	const gatewayStatus = {
		status: overrides.gatewayStatus ?? vi.fn().mockResolvedValue({ gateways: [gateway('gw-1')], configVersion: 1 }),
	} as unknown as GatewayStatusService;
	const realtime = buildRealtimePublisherFake();
	const docker = { isReachable: vi.fn().mockResolvedValue(overrides.isDockerReachable ?? true) } as unknown as ContainerDriver;
	const service = new SystemHealthService(prisma, eventRepository, realtime, gatewayStatus, docker, redis);

	return { service, eventRepository, realtime };
}

describe('SystemHealthService.checkDocker', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
	});

	it('is not a dependency where scaling is off', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'false');
		await expect(buildService({}).service['checkDocker']()).resolves.toBeNull();
	});

	it('reports the daemon up or down where scaling is on', async () => {
		vi.stubEnv('SCALING_ALLOWED', 'true');
		await expect(buildService({ isDockerReachable: true }).service['checkDocker']()).resolves.toEqual({
			component: 'docker',
			status: 'up',
			detail: null,
		});
		await expect(buildService({ isDockerReachable: false }).service['checkDocker']()).resolves.toEqual({
			component: 'docker',
			status: 'down',
			detail: 'Docker daemon unreachable',
		});
	});
});

describe('SystemHealthService.checkPrimary', () => {
	it('reports up when the query succeeds', async () => {
		const { service } = buildService({ queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]) });

		const result = await service['checkPrimary']();

		expect(result).toEqual({ component: 'control_plane_db_primary', status: 'up', detail: null });
	});

	it('reports down with a detail message when the query fails', async () => {
		const { service } = buildService({ queryRaw: vi.fn().mockRejectedValue(new Error('connection refused')) });

		const result = await service['checkPrimary']();

		expect(result).toEqual({
			component: 'control_plane_db_primary',
			status: 'down',
			detail: 'connection refused',
		});
	});
});

describe('SystemHealthService.checkRedis', () => {
	it('reports down with the failure detail when the ping fails', async () => {
		const { service } = buildService({ redisPing: vi.fn().mockRejectedValue(new Error('connection refused')) });

		expect(await service['checkRedis']()).toEqual({ component: 'control_plane_redis', status: 'down', detail: 'connection refused' });
	});
});

describe('SystemHealthService transition recording', () => {
	it('records an event on the first check and getCurrentStatus reflects it', async () => {
		const { service, eventRepository } = buildService({});

		await service['checkAll']();

		expect(eventRepository.record).toHaveBeenCalledWith(expect.objectContaining({ component: 'control_plane_db_primary', status: 'up' }));
		expect(service.getCurrentStatus()).toContainEqual(expect.objectContaining({ component: 'control_plane_redis', status: 'up' }));
	});

	it('does not record a second event when the status has not changed', async () => {
		const { service, eventRepository } = buildService({});

		await service['checkAll']();
		eventRepository.record = vi.fn().mockResolvedValue(undefined);
		await service['checkAll']();

		expect(eventRepository.record).not.toHaveBeenCalled();
	});

	it('records a new event once a component actually transitions', async () => {
		const queryRaw = vi
			.fn()
			.mockResolvedValueOnce([{ 1: 1 }])
			.mockRejectedValueOnce(new Error('down'));
		const { service, eventRepository } = buildService({ queryRaw });

		await service['checkAll']();
		await service['checkAll']();

		expect(eventRepository.record).toHaveBeenCalledWith(expect.objectContaining({ component: 'control_plane_db_primary', status: 'down' }));
	});
});

describe('SystemHealthService.checkGateways', () => {
	it('is up while a gateway is alive, down without one or when the check fails', async () => {
		const gatewayStatus = vi
			.fn()
			.mockResolvedValueOnce(statusOf(gateway('gw-1'), gateway('gw-2', false)))
			.mockResolvedValueOnce(statusOf(gateway('gw-2', false)))
			.mockRejectedValueOnce(new Error('redis down'));
		const { service } = buildService({ gatewayStatus });

		expect(await service['checkGateways']()).toEqual({ component: 'gateway', status: 'up', detail: null });
		expect(await service['checkGateways']()).toEqual({ component: 'gateway', status: 'down', detail: 'No gateway heartbeat' });
		expect(await service['checkGateways']()).toEqual({ component: 'gateway', status: 'down', detail: 'redis down' });
	});

	it('announces each gateway coming and going, but not the first discovery', async () => {
		const gatewayStatus = vi
			.fn()
			.mockResolvedValueOnce(statusOf(gateway('gw-1')))
			.mockResolvedValueOnce(statusOf(gateway('gw-2')));
		const { service, realtime } = buildService({ gatewayStatus });

		await service['checkGateways']();
		expect(realtime.publishToAdmins).not.toHaveBeenCalled();
		await service['checkGateways']();

		expect(vi.mocked(realtime.publishToAdmins).mock.calls.map(([event]) => event)).toEqual([
			{ type: 'gateway.status.changed', gatewayId: 'gw-2', status: 'up' },
			{ type: 'gateway.status.changed', gatewayId: 'gw-1', status: 'stopped' },
		]);
	});

	it('tells a gateway that went silent (stale heartbeat) from one that shut down (heartbeat gone)', async () => {
		const gatewayStatus = vi
			.fn()
			.mockResolvedValueOnce(statusOf(gateway('gw-1'), gateway('gw-2')))
			.mockResolvedValueOnce(statusOf(gateway('gw-1', false)));
		const { service, realtime } = buildService({ gatewayStatus });

		await service['checkGateways']();
		await service['checkGateways']();

		expect(vi.mocked(realtime.publishToAdmins).mock.calls.map(([event]) => event)).toEqual([
			{ type: 'gateway.status.changed', gatewayId: 'gw-1', status: 'down' },
			{ type: 'gateway.status.changed', gatewayId: 'gw-2', status: 'stopped' },
		]);
	});
});
