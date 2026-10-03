import type { InstanceConfig, ServiceConfig } from '@pyle/shared/contracts/config-snapshot.js';

export type SelectInstanceInput = {
	readonly service: ServiceConfig;
	// Enabled, available and not yet tried by this request; never empty.
	readonly candidates: readonly InstanceConfig[];
};

export interface LoadBalancer {
	select(input: SelectInstanceInput): InstanceConfig;
}

// Kept across reloads so round-robin cursors survive a configuration change.
export interface LoadBalancerRegistry {
	forService(service: ServiceConfig): LoadBalancer;
	// Drops the state of services that no longer exist (called on reload).
	retainOnly(serviceIds: ReadonlySet<string>): void;
}
