import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module.js';
import { getAiProvider, type AiProvider } from '../config/ai-provider.js';
import { ControlPlaneModule } from '../control-plane/control-plane.module.js';
import { GatewayConfigModule } from '../gateway-config/gateway-config.module.js';
import { SystemHealthModule } from '../system-health/system-health.module.js';
import { TrafficModule } from '../traffic/traffic.module.js';
import { AiAnalysisService } from './application/ai-analysis.service.js';
import { AiModelClient } from './application/ai-model-client.js';
import { AnalysisToolFactory } from './application/analysis-tools.factory.js';
import { AiAnalysisRepository } from './infrastructure/ai-analysis.repository.js';
import { AnthropicModelClient } from './infrastructure/anthropic-model-client.js';
import { GroqModelClient } from './infrastructure/groq-model-client.js';
import { AiAnalysisController } from './interface/ai-analysis.controller.js';

// Adding a provider = one more adapter class here; nothing else changes.
const MODEL_CLIENT_BY_PROVIDER: Readonly<Record<AiProvider, new () => AiModelClient>> = {
	anthropic: AnthropicModelClient,
	groq: GroqModelClient,
};

// Owns only the AiAnalysis tables and the model call; the tools read other modules'
// services.
@Module({
	imports: [ControlPlaneModule, AuthModule, SystemHealthModule, GatewayConfigModule, TrafficModule],
	controllers: [AiAnalysisController],
	providers: [{ provide: AiModelClient, useFactory: createModelClient }, AiAnalysisRepository, AnalysisToolFactory, AiAnalysisService],
	exports: [AiModelClient, AnalysisToolFactory, AiAnalysisService],
})
export class AiAnalysisModule {}

function createModelClient(): AiModelClient {
	const ModelClient = MODEL_CLIENT_BY_PROVIDER[getAiProvider()];

	return new ModelClient();
}
