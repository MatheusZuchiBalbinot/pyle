import type { InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import { createBalancerFactory, type StrategyDependencies } from '../balancing/load-balancer-registry.js';
import type { ExtensionBuilder, GatewayExtensions, GatewayLifecycleHook } from '../gateway-app.js';
import { UpstreamAgents, type UpstreamAgent } from '../proxy/upstream-agents.js';
import type { RouteTable } from '../routing/route-table.js';
import { HealthChecker } from './health-checker.js';
import { IdempotentRetryPolicy } from './idempotent-retry-policy.js';
import { InstanceStateTracker } from './instance-state-tracker.js';
import { createProbe } from './probe-instance.js';

function instanceIdsOf(table: RouteTable): ReadonlySet<string> {
	return new Set(table.snapshot.services.flatMap((service) => service.instances.map((instance) => instance.id)));
}

export const buildResilienceExtensions: ExtensionBuilder = (context) => {
	const tracker = new InstanceStateTracker({ gatewayId: context.config.gatewayId, eventSink: context.eventSink, now: context.now });
	// Checks get their own connections: a check must not queue behind
	// traffic on a busy instance's sockets.
	const probeAgents = new UpstreamAgents();
	const agentFor = (instance: InstanceConfig, url: URL): UpstreamAgent => probeAgents.forInstance(instance.id, url);
	const probe = createProbe({ agentFor, now: context.now });
	const checker = new HealthChecker({ probe, onResult: (instanceId, result) => tracker.recordProbe(instanceId, result), random: Math.random });
	const strategies: StrategyDependencies = { inFlightOf: (instanceId) => tracker.inFlightOf(instanceId), random: Math.random };

	function applyConfig(table: RouteTable): void {
		tracker.syncInstances(table.snapshot);
		checker.syncInstances(table.snapshot);
		probeAgents.retainOnly(instanceIdsOf(table));
	}

	function stop(): void {
		checker.stop();
		probeAgents.destroyAll();
	}

	const hook: GatewayLifecycleHook = { start: (table) => checker.start(table.snapshot), onConfigApplied: applyConfig, stop };
	const extensions: Partial<GatewayExtensions> = {
		availability: tracker,
		attemptObserver: tracker,
		retryPolicy: new IdempotentRetryPolicy(),
		balancerFactory: createBalancerFactory(strategies),
		instanceStates: tracker,
		hooks: [hook],
	};

	return extensions;
};
