import type { LoadBalancingStrategyName, ServiceConfig } from '@pyle/shared/contracts/config-snapshot.js';
import { assertUnreachable } from '@pyle/shared/utils/assert-unreachable.js';

import type { LoadBalancer, LoadBalancerRegistry } from '../contracts/load-balancer.js';
import { LeastConnectionsBalancer, type InFlightCounter } from './least-connections.js';
import { RoundRobinBalancer } from './round-robin.js';
import { WeightedRandomBalancer, type RandomSource } from './weighted-random.js';

export type BalancerFactory = (strategy: LoadBalancingStrategyName) => LoadBalancer;

export type StrategyDependencies = {
	readonly inFlightOf: InFlightCounter;
	readonly random: RandomSource;
};

type Entry = { readonly strategy: LoadBalancingStrategyName; readonly balancer: LoadBalancer };

// One balancer per service, recreated only when its strategy changes.
export class PerServiceLoadBalancerRegistry implements LoadBalancerRegistry {
	private readonly entries = new Map<string, Entry>();

	constructor(private readonly createBalancer: BalancerFactory) {}

	forService(service: ServiceConfig): LoadBalancer {
		const existing = this.entries.get(service.id);

		if (existing?.strategy === service.lbStrategy) {
			return existing.balancer;
		}

		const balancer = this.createBalancer(service.lbStrategy);

		this.entries.set(service.id, { strategy: service.lbStrategy, balancer });

		return balancer;
	}

	retainOnly(serviceIds: ReadonlySet<string>): void {
		for (const serviceId of this.entries.keys()) {
			if (!serviceIds.has(serviceId)) {
				this.entries.delete(serviceId);
			}
		}
	}

	get size(): number {
		return this.entries.size;
	}
}

// Without the resilience extension there are no in-flight counts to balance on.
export function roundRobinForEveryStrategy(): LoadBalancer {
	return new RoundRobinBalancer();
}

export function createBalancerFactory(dependencies: StrategyDependencies): BalancerFactory {
	return (strategy) => {
		if (strategy === 'round_robin') {
			return new RoundRobinBalancer();
		}

		if (strategy === 'least_connections') {
			return new LeastConnectionsBalancer(dependencies.inFlightOf);
		}

		if (strategy === 'weighted_random') {
			return new WeightedRandomBalancer(dependencies.random);
		}

		return assertUnreachable(strategy);
	};
}
