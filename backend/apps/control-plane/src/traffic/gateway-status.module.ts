import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayStatusService } from './application/gateway-status.service.js';
import { GatewayHeartbeatReader } from './infrastructure/gateway-heartbeat.reader.js';
import { GatewayStatusController } from './interface/gateway-status.controller.js';

// Its own module: system health needs it, and traffic needs system health.
@Module({
	imports: [ControlPlaneModule, AuthModule],
	controllers: [GatewayStatusController],
	providers: [GatewayHeartbeatReader, GatewayStatusService],
	exports: [GatewayStatusService],
})
export class GatewayStatusModule {}
