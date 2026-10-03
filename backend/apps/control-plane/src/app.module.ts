import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClsModule } from 'nestjs-cls';

import { AdminNotificationsModule } from './admin-notifications/admin-notifications.module.js';
import { AiAnalysisModule } from './ai-analysis/ai-analysis.module.js';
import { AiAssistantModule } from './ai-assistant/ai-assistant.module.js';
import { DataRetentionModule } from './data-retention/data-retention.module.js';
import { GatewayConfigModule } from './gateway-config/gateway-config.module.js';
import { HealthModule } from './health/health.module.js';
import { CorrelationIdMiddleware } from './observability/interface/correlation-id.middleware.js';
import { ObservabilityModule } from './observability/observability.module.js';
import { PlatformSettingsModule } from './platform-settings/platform-settings.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { ScalingModule } from './scaling/scaling.module.js';
import { SystemHealthModule } from './system-health/system-health.module.js';
import { TrafficModule } from './traffic/traffic.module.js';

// The control plane: admin API, console realtime, AI and background upkeep.
// The gateway's data plane is a separate process (apps/gateway).
@Module({
	imports: [
		ConfigModule.forRoot({ isGlobal: true }),
		// Opens the async-local context CorrelationIdMiddleware writes the
		// request id into, for every route.
		ClsModule.forRoot({ global: true, middleware: { mount: true } }),
		ObservabilityModule,
		GatewayConfigModule,
		ScalingModule,
		TrafficModule,
		AiAnalysisModule,
		AiAssistantModule,
		AdminNotificationsModule,
		PlatformSettingsModule,
		RealtimeModule,
		SystemHealthModule,
		DataRetentionModule,
		HealthModule,
	],
})
export class AppModule implements NestModule {
	configure(consumer: MiddlewareConsumer): void {
		// Every request (admin API included) gets an id, so
		// RequestLoggingInterceptor always has one to log.
		consumer.apply(CorrelationIdMiddleware).forRoutes('*');
	}
}
