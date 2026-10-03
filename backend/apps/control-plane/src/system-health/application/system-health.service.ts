import { Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { SystemHealthComponent } from '@prisma/control-plane-client';
import { Redis } from 'ioredis';

import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getControlPlaneRedisUrl } from '../../config/control-plane-redis.js';
import { getScalingConfig } from '../../config/scaling.js';
import { getSystemHealthCheckIntervalMs } from '../../config/system-health.js';
import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import { RealtimePublisherService } from '../../realtime/application/realtime-publisher.service.js';
import type { GatewayStatusChange } from '../../realtime/domain/realtime-event.js';
import { ContainerDriver } from '../../scaling/application/scaling-ports.js';
import { GatewayStatusService } from '../../traffic/application/gateway-status.service.js';
import { SystemHealthEventRepository } from '../infrastructure/system-health-event.repository.js';
import type { SystemHealthComponentStatusDto } from '../interface/dto/system-health-component-status.dto.js';
import { toSystemHealthEventDto, type SystemHealthEventDto } from '../interface/dto/system-health-event.dto.js';

// A seam so unit tests need no reachable Redis.
export type RedisHealthProbe = {
	readonly ping: () => Promise<unknown>;
	readonly disconnect: () => void;
};

const NO_GATEWAY_DETAIL = 'No gateway heartbeat';
const DOCKER_UNREACHABLE_DETAIL = 'Docker daemon unreachable';

@Injectable()
export class SystemHealthService implements OnModuleInit, OnModuleDestroy {
	private readonly logger = new Logger(SystemHealthService.name);
	private readonly redis: RedisHealthProbe;
	private intervalHandle: NodeJS.Timeout | undefined;
	private statusByComponent = new Map<SystemHealthComponent, SystemHealthComponentStatusDto>();
	// Null until the first check: discovering gateways is not a change.
	private aliveGatewayIds: ReadonlySet<string> | null = null;

	// Only tests pass redis, hence @Optional().
	constructor(
		private readonly prisma: ControlPlanePrismaService,
		private readonly eventRepository: SystemHealthEventRepository,
		private readonly realtimePublisher: RealtimePublisherService,
		private readonly gatewayStatus: GatewayStatusService,
		private readonly docker: ContainerDriver,
		@Optional() redis?: RedisHealthProbe,
	) {
		this.redis = redis ?? new Redis(getControlPlaneRedisUrl());
	}

	onModuleInit(): void {
		void this.checkAll();
		this.intervalHandle = setInterval(() => void this.checkAll(), getSystemHealthCheckIntervalMs());
	}

	onModuleDestroy(): void {
		if (this.intervalHandle) {
			clearInterval(this.intervalHandle);
		}

		this.redis.disconnect();
	}

	getCurrentStatus(): readonly SystemHealthComponentStatusDto[] {
		return Array.from(this.statusByComponent.values());
	}

	async listRecentEvents(): Promise<readonly SystemHealthEventDto[]> {
		const events = await this.eventRepository.listRecent();

		return events.map(toSystemHealthEventDto);
	}

	private async checkAll(): Promise<void> {
		const results = await Promise.all([this.checkPrimary(), this.checkRedis(), this.checkGateways(), this.checkDocker()]);
		const checked = results.filter((result): result is SystemHealthComponentStatusDto => result !== null);

		await Promise.all(checked.map((result) => this.applyResult(result)));
	}

	// Only transitions are recorded, not every tick.
	private async applyResult(result: SystemHealthComponentStatusDto): Promise<void> {
		const previous = this.statusByComponent.get(result.component);

		this.statusByComponent.set(result.component, result);
		const isTransition = previous === undefined || previous.status !== result.status;

		if (!isTransition) {
			return;
		}

		await this.eventRepository
			.record({ component: result.component, status: result.status, detail: result.detail })
			.catch((error: unknown) => this.logger.warn(`Failed to record a SystemHealthEvent: ${toErrorMessage(error)}`));

		// The very first tick is discovery, not a change anyone needs to be told about.
		if (previous === undefined) {
			return;
		}

		await this.realtimePublisher.publishToAdmins({
			type: 'system.component.changed',
			component: result.component,
			status: result.status,
			detail: result.detail,
		});
	}

	private async checkPrimary(): Promise<SystemHealthComponentStatusDto> {
		try {
			await this.prisma.$queryRaw`SELECT 1`;

			return { component: 'control_plane_db_primary', status: 'up', detail: null };
		} catch (error) {
			return { component: 'control_plane_db_primary', status: 'down', detail: toErrorMessage(error) };
		}
	}

	// Up while at least one gateway heartbeats. Each gateway coming or going
	// is told to the console too (gateway.status.changed).
	private async checkGateways(): Promise<SystemHealthComponentStatusDto> {
		try {
			const { gateways } = await this.gatewayStatus.status();
			const alive = new Set(gateways.filter((gateway) => gateway.isAlive).map((gateway) => gateway.gatewayId));
			const silent = new Set(gateways.filter((gateway) => !gateway.isAlive).map((gateway) => gateway.gatewayId));

			await this.announceGatewayChanges(alive, silent);

			if (alive.size === 0) {
				return { component: 'gateway', status: 'down', detail: NO_GATEWAY_DETAIL };
			}

			return { component: 'gateway', status: 'up', detail: null };
		} catch (error) {
			return { component: 'gateway', status: 'down', detail: toErrorMessage(error) };
		}
	}

	// A gateway that shut down cleanly deleted its heartbeat; one still listed
	// but stale went silent (crash, network), which is the one worth an alarm.
	private async announceGatewayChanges(alive: ReadonlySet<string>, silent: ReadonlySet<string>): Promise<void> {
		const previous = this.aliveGatewayIds;

		this.aliveGatewayIds = alive;

		if (previous === null) {
			return;
		}

		const started = [...alive].filter((gatewayId) => !previous.has(gatewayId));
		const gone = [...previous].filter((gatewayId) => !alive.has(gatewayId));

		for (const gatewayId of started) {
			await this.realtimePublisher.publishToAdmins({ type: 'gateway.status.changed', gatewayId, status: 'up' });
		}

		for (const gatewayId of gone) {
			const status: GatewayStatusChange = silent.has(gatewayId) ? 'down' : 'stopped';

			await this.realtimePublisher.publishToAdmins({ type: 'gateway.status.changed', gatewayId, status });
		}
	}

	private async checkDocker(): Promise<SystemHealthComponentStatusDto | null> {
		if (!getScalingConfig().isAllowed) {
			return null;
		}

		const isReachable = await this.docker.isReachable();

		if (isReachable) {
			return { component: 'docker', status: 'up', detail: null };
		}

		return { component: 'docker', status: 'down', detail: DOCKER_UNREACHABLE_DETAIL };
	}

	private async checkRedis(): Promise<SystemHealthComponentStatusDto> {
		try {
			await this.redis.ping();

			return { component: 'control_plane_redis', status: 'up', detail: null };
		} catch (error) {
			return { component: 'control_plane_redis', status: 'down', detail: toErrorMessage(error) };
		}
	}
}
