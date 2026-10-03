import { Module } from '@nestjs/common';

import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module.js';
import { DataRetentionScheduler } from './application/data-retention.scheduler.js';
import { DataRetentionService } from './application/data-retention.service.js';
import { DataRetentionRepository } from './infrastructure/data-retention.repository.js';

@Module({
	imports: [ControlPlaneModule, GatewayConfigModule],
	providers: [DataRetentionRepository, DataRetentionService, DataRetentionScheduler],
	exports: [DataRetentionService],
})
export class DataRetentionModule {}
