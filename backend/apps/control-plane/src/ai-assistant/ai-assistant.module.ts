import { Module } from '@nestjs/common';

import { AiAnalysisModule } from '../ai-analysis/ai-analysis.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module.js';
import { TrafficModule } from '../traffic/traffic.module.js';
import { AiAssistantService } from './application/ai-assistant.service.js';
import { AssistantToolFactory } from './application/assistant-tools.factory.js';
import { AiAssistantController } from './interface/ai-assistant.controller.js';
import { AssistantThrottlerGuard } from './interface/assistant-throttler.guard.js';

@Module({
	imports: [AiAnalysisModule, AuthModule, ControlPlaneModule, GatewayConfigModule, TrafficModule],
	controllers: [AiAssistantController],
	providers: [AiAssistantService, AssistantToolFactory, AssistantThrottlerGuard],
})
export class AiAssistantModule {}
