export type InstanceHealthStatus = 'healthy' | 'unhealthy' | 'unknown';
export type InstanceCircuitStatus = 'closed' | 'open' | 'half_open';

export type InstanceLiveState = {
	readonly instanceId: string;
	readonly gatewayId: string;
	readonly health: InstanceHealthStatus;
	readonly circuit: InstanceCircuitStatus;
	readonly inFlight: number;
	readonly consecutiveFailures: number;
	readonly lastCheckAt: string | null;
	readonly lastCheckLatencyMs: number | null;
	readonly updatedAt: string;
};

export type GatewayHeartbeat = {
	readonly gatewayId: string;
	readonly startedAt: string;
	readonly configVersion: number;
	// The rate limiter could not reach Redis recently and is failing open.
	readonly isRateLimitDegraded: boolean;
	readonly updatedAt: string;
};
