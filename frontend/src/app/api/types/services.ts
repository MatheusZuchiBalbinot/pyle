export type HttpMethodName = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type LoadBalancingStrategy = 'round_robin' | 'least_connections' | 'weighted_random';
export type InstanceSource = 'static' | 'managed';

// Lifecycle of a managed instance's container.
export type ManagedInstanceState = 'provisioning' | 'running' | 'draining' | 'failed';

export type ScalingProfile = 'demo_orders' | 'demo_users' | 'demo_catalog';

export type ChaosState = {
	readonly latencyMs: number;
	readonly jitterMs: number;
	// Fraction of requests answered with 500, 0..1.
	readonly errorRate: number;
	readonly isDown: boolean;
};

export type InstanceLiveState = {
	readonly instanceId: string;
	readonly gatewayId: string;
	readonly health: 'healthy' | 'unhealthy' | 'unknown';
	readonly circuit: 'closed' | 'open' | 'half_open';
	readonly inFlight: number;
	readonly consecutiveFailures: number;
	readonly lastCheckAt: string | null;
	readonly lastCheckLatencyMs: number | null;
	readonly updatedAt: string;
};

export type ServiceInstance = {
	readonly id: string;
	readonly serviceId: string;
	readonly name: string;
	readonly url: string;
	readonly weight: number;
	readonly isEnabled: boolean;
	readonly source: InstanceSource;
	// Only for managed instances.
	readonly scalingState: ManagedInstanceState | null;
	// Null when no gateway reported it yet.
	readonly live: InstanceLiveState | null;
	readonly chaos: ChaosState | null;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type ServiceHealthCheck = {
	readonly path: string;
	readonly intervalMs: number;
	readonly timeoutMs: number;
	readonly healthyThreshold: number;
	readonly unhealthyThreshold: number;
};

export type ServiceCircuit = {
	readonly failureThreshold: number;
	readonly cooldownMs: number;
};

export type Service = {
	readonly id: string;
	readonly slug: string;
	readonly name: string;
	readonly description: string | null;
	readonly lbStrategy: LoadBalancingStrategy;
	readonly timeoutMs: number;
	readonly retryMaxAttempts: number;
	readonly healthCheck: ServiceHealthCheck;
	readonly circuit: ServiceCircuit;
	// Profile null: instances are managed by hand (compose) only.
	readonly scaling: { readonly profile: ScalingProfile | null; readonly desiredManagedReplicas: number };
	readonly instances: readonly ServiceInstance[];
	readonly routeCount: number;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type CreateServiceInput = {
	readonly slug: string;
	readonly name: string;
	readonly description?: string;
	readonly lbStrategy?: LoadBalancingStrategy;
	readonly timeoutMs?: number;
	readonly retryMaxAttempts?: number;
	readonly healthCheckPath?: string;
	readonly healthCheckIntervalMs?: number;
	readonly healthCheckTimeoutMs?: number;
	readonly healthyThreshold?: number;
	readonly unhealthyThreshold?: number;
	readonly circuitFailureThreshold?: number;
	readonly circuitCooldownMs?: number;
};

export type UpdateServiceInput = Partial<Omit<CreateServiceInput, 'slug'>>;

export type CreateInstanceInput = {
	readonly name: string;
	readonly url: string;
	readonly weight?: number;
	readonly isEnabled?: boolean;
};

export type UpdateInstanceInput = Partial<CreateInstanceInput>;

// Draining the last enabled instance is allowed, with this warning.
export type InstanceWarning = 'service-has-no-enabled-instance';

export type UpdateInstanceResult = {
	readonly instance: ServiceInstance;
	readonly warning: InstanceWarning | null;
};
