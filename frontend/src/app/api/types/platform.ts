export type SystemHealthComponent = 'control_plane_db_primary' | 'control_plane_redis' | 'gateway' | 'docker';

export type SystemHealthStatusValue = 'up' | 'degraded' | 'down';

export type SystemHealthComponentStatus = {
	readonly component: SystemHealthComponent;
	readonly status: SystemHealthStatusValue;
	readonly detail: string | null;
};

export type SystemHealthEvent = {
	readonly component: SystemHealthComponent;
	readonly status: SystemHealthStatusValue;
	readonly detail: string | null;
	readonly occurredAt: string;
};

export type AiProvider = 'anthropic' | 'groq';

export type PlatformSettings = {
	readonly systemHealthCheckIntervalMs: number;
	readonly gateway: {
		readonly port: number;
		readonly adminPort: number;
		readonly configRefreshMs: number;
		readonly metricsFlushMs: number;
		readonly heartbeatMs: number;
		readonly maxRequestTimeoutMs: number;
		readonly requestLogMaxEntries: number;
		readonly requestLogSuccessSampleRate: number;
	};
	readonly traffic: {
		readonly retentionHours: number;
		readonly alertEvaluationIntervalMs: number;
		readonly consumerPurgeAfterDays: number;
		readonly isChaosAllowed: boolean;
	};
	readonly scaling: { readonly isAllowed: boolean; readonly maxManagedReplicas: number };
	readonly ai: { readonly provider: AiProvider; readonly isConfigured: boolean; readonly modelId: string | null };
	readonly realtime: { readonly consoleWebSocketUrl: string };
};
