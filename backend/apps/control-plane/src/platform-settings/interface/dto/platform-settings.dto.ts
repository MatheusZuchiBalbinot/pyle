import type { AiProvider } from '../../../config/ai-provider.js';

class GatewaySettingsDto {
	readonly port!: number;
	readonly adminPort!: number;
	readonly configRefreshMs!: number;
	readonly metricsFlushMs!: number;
	readonly heartbeatMs!: number;
	readonly maxRequestTimeoutMs!: number;
	readonly requestLogMaxEntries!: number;
	readonly requestLogSuccessSampleRate!: number;
}

class TrafficSettingsDto {
	readonly retentionHours!: number;
	readonly alertEvaluationIntervalMs!: number;
	readonly consumerPurgeAfterDays!: number;
	readonly isChaosAllowed!: boolean;
}

class ScalingSettingsDto {
	readonly isAllowed!: boolean;
	readonly maxManagedReplicas!: number;
}

class AiSettingsDto {
	readonly provider!: AiProvider;
	readonly isConfigured!: boolean;
	// Null until configured — never a hardcoded default.
	readonly modelId!: string | null;
}

class RealtimeSettingsDto {
	readonly consoleWebSocketUrl!: string;
}

// Secrets never appear here, only whether they are set.
export class PlatformSettingsDto {
	readonly systemHealthCheckIntervalMs!: number;
	readonly gateway!: GatewaySettingsDto;
	readonly traffic!: TrafficSettingsDto;
	readonly scaling!: ScalingSettingsDto;
	readonly ai!: AiSettingsDto;
	readonly realtime!: RealtimeSettingsDto;
}
