import { Global, Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { EntityChangeBroadcaster } from './application/entity-change-broadcaster.service.js';
import { RealtimePublisherService } from './application/realtime-publisher.service.js';
import { RealtimeTokenService } from './application/realtime-token.service.js';
import { CentrifugoNodeClient } from './infrastructure/centrifugo-node-client.js';
import { AdminRealtimeController } from './interface/admin-realtime.controller.js';

// Global, so any module can emit an event without importing this one (and no import cycle).
@Global()
@Module({
	imports: [AuthModule, ControlPlaneModule],
	controllers: [AdminRealtimeController],
	providers: [RealtimePublisherService, RealtimeTokenService, CentrifugoNodeClient, EntityChangeBroadcaster],
	exports: [RealtimePublisherService, CentrifugoNodeClient],
})
export class RealtimeModule {}
