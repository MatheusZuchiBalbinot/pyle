import { Module } from '@nestjs/common';

import { EntityChangeBus } from './entity-changes/entity-change-bus.service.js';
import { ControlPlanePrismaService } from './prisma/control-plane-prisma.service.js';
import { ControlPlaneRedisService } from './redis/control-plane-redis.service.js';

@Module({
	providers: [EntityChangeBus, ControlPlanePrismaService, ControlPlaneRedisService],
	exports: [EntityChangeBus, ControlPlanePrismaService, ControlPlaneRedisService],
})
export class ControlPlaneModule {}
