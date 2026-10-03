import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { ScalingModule } from '../scaling/scaling.module.js';
import { GatewayStatusModule } from '../traffic/gateway-status.module.js';
import { SystemHealthService } from './application/system-health.service.js';
import { SystemHealthEventRepository } from './infrastructure/system-health-event.repository.js';
import { SystemHealthController } from './interface/system-health.controller.js';

@Module({
	imports: [ControlPlaneModule, AuthModule, GatewayStatusModule, ScalingModule],
	controllers: [SystemHealthController],
	providers: [SystemHealthService, SystemHealthEventRepository],
	exports: [SystemHealthService],
})
export class SystemHealthModule {}
