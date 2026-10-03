import { Injectable } from '@nestjs/common';

import { readGatewayConfig } from '@pyle/shared/config/gateway.js';
import type { GatewayHeartbeat } from '@pyle/shared/contracts/instance-live-state.js';
import { loadGatewayConfig } from '@pyle/shared/snapshot/load-gateway-config.js';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { GatewayStatusDto, GatewayStatusEntryDto } from '../domain/traffic-responses.js';
import { GatewayHeartbeatReader } from '../infrastructure/gateway-heartbeat.reader.js';

// A gateway that missed one beat is still alive; the key itself expires
// after three.
const GATEWAY_ALIVE_BEATS = 2;

@Injectable()
export class GatewayStatusService {
	constructor(
		private readonly heartbeats: GatewayHeartbeatReader,
		private readonly prisma: ControlPlanePrismaService,
	) {}

	async status(): Promise<GatewayStatusDto> {
		const now = Date.now();
		const [gateways, snapshot] = await Promise.all([this.gateways(now), loadGatewayConfig(this.prisma, now)]);

		return { gateways, configVersion: snapshot.version };
	}

	private async gateways(now: number): Promise<readonly GatewayStatusEntryDto[]> {
		const aliveWithinMs = readGatewayConfig().heartbeatMs * GATEWAY_ALIVE_BEATS;
		const isAlive = (heartbeat: GatewayHeartbeat): boolean => now - Date.parse(heartbeat.updatedAt) <= aliveWithinMs;
		const heartbeats = await this.heartbeats.readAll();
		const gateways = heartbeats.map((heartbeat) => ({ ...heartbeat, isAlive: isAlive(heartbeat) }));

		return gateways.sort((left, right) => left.gatewayId.localeCompare(right.gatewayId));
	}
}
