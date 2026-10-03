import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module.js';
import { InstanceReconciler } from './application/instance-reconciler.js';
import { ContainerDriver, InstanceHealthProbe } from './application/scaling-ports.js';
import { ScalingService } from './application/scaling.service.js';
import { DockerContainerDriver } from './infrastructure/docker-container-driver.js';
import { HttpHealthProbe } from './infrastructure/http-health-probe.js';
import { ManagedInstanceRepository } from './infrastructure/managed-instance.repository.js';
import { ScalingController } from './interface/scaling.controller.js';

// Inert unless SCALING_ALLOWED=true.
@Module({
	imports: [AuthModule, ControlPlaneModule, GatewayConfigModule],
	controllers: [ScalingController],
	providers: [
		ScalingService,
		InstanceReconciler,
		ManagedInstanceRepository,
		{ provide: ContainerDriver, useFactory: (): ContainerDriver => new DockerContainerDriver() },
		{ provide: InstanceHealthProbe, useFactory: (): InstanceHealthProbe => new HttpHealthProbe() },
	],
	exports: [ContainerDriver],
})
export class ScalingModule {}
