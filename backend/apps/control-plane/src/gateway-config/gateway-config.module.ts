import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { ChaosService } from './application/chaos.service.js';
import { ConfigActivityService } from './application/config-activity.service.js';
import { ConfigChangeRecorder } from './application/config-change-recorder.js';
import { ConsumerPurgeService } from './application/consumer-purge.service.js';
import { ConsumersService } from './application/consumers.service.js';
import { InstanceRuntimeService } from './application/instance-runtime.service.js';
import { InstancesService } from './application/instances.service.js';
import { RoutesService } from './application/routes.service.js';
import { ServicesService } from './application/services.service.js';
import { ApiKeyRepository } from './infrastructure/api-key.repository.js';
import { ChaosStateStore } from './infrastructure/chaos-state.store.js';
import { ConfigChangeEventRepository } from './infrastructure/config-change-event.repository.js';
import { ConfigChangePublisher } from './infrastructure/config-change-publisher.js';
import { ConsumerRepository } from './infrastructure/consumer.repository.js';
import { DemoChaosClient } from './infrastructure/demo-chaos.client.js';
import { InstanceLiveStateReader } from './infrastructure/instance-live-state.reader.js';
import { InstanceRepository } from './infrastructure/instance.repository.js';
import { RouteRepository } from './infrastructure/route.repository.js';
import { ServiceRepository } from './infrastructure/service.repository.js';
import { ConfigActivityController } from './interface/config-activity.controller.js';
import { ConsumersController } from './interface/consumers.controller.js';
import { RoutesController } from './interface/routes.controller.js';
import { ServicesController } from './interface/services.controller.js';

@Module({
	imports: [ControlPlaneModule, AuthModule],
	controllers: [ServicesController, RoutesController, ConsumersController, ConfigActivityController],
	providers: [
		ServiceRepository,
		InstanceRepository,
		RouteRepository,
		ConsumerRepository,
		ApiKeyRepository,
		ConfigChangeEventRepository,
		ConfigChangePublisher,
		InstanceLiveStateReader,
		ChaosStateStore,
		DemoChaosClient,
		ConfigChangeRecorder,
		InstanceRuntimeService,
		ServicesService,
		InstancesService,
		RoutesService,
		ConsumersService,
		ChaosService,
		ConfigActivityService,
		ConsumerPurgeService,
	],
	exports: [
		ConfigChangeRecorder,
		InstanceLiveStateReader,
		ServicesService,
		InstancesService,
		RoutesService,
		ConsumersService,
		ConfigActivityService,
		ConsumerPurgeService,
		ServiceRepository,
		InstanceRepository,
		RouteRepository,
		ConsumerRepository,
	],
})
export class GatewayConfigModule {}
