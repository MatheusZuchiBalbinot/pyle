import { describe, expect, it, vi } from 'vitest';

import { TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { LeastConnectionsBalancer } from './least-connections.js';
import { createBalancerFactory, PerServiceLoadBalancerRegistry, roundRobinForEveryStrategy } from './load-balancer-registry.js';
import { RoundRobinBalancer } from './round-robin.js';
import { WeightedRandomBalancer } from './weighted-random.js';

describe('PerServiceLoadBalancerRegistry', () => {
	it('keeps one balancer per service while its strategy stays the same', () => {
		const factory = vi.fn(roundRobinForEveryStrategy);
		const registry = new PerServiceLoadBalancerRegistry(factory);

		const first = registry.forService(TEST_SERVICE);
		const again = registry.forService({ ...TEST_SERVICE, timeoutMs: 1 });

		expect(again).toBe(first);
		expect(first).toBeInstanceOf(RoundRobinBalancer);
		expect(factory).toHaveBeenCalledTimes(1);
	});

	it('builds a new balancer when the strategy changes', () => {
		const factory = vi.fn(roundRobinForEveryStrategy);
		const registry = new PerServiceLoadBalancerRegistry(factory);

		registry.forService(TEST_SERVICE);
		registry.forService({ ...TEST_SERVICE, lbStrategy: 'weighted_random' });

		expect(factory).toHaveBeenLastCalledWith('weighted_random');
	});

	it('forgets services that are gone', () => {
		const registry = new PerServiceLoadBalancerRegistry(roundRobinForEveryStrategy);

		registry.forService(TEST_SERVICE);
		registry.forService({ ...TEST_SERVICE, id: 'other' });

		registry.retainOnly(new Set(['other']));

		expect(registry.size).toBe(1);
	});
});

describe('createBalancerFactory', () => {
	it('builds each strategy', () => {
		const factory = createBalancerFactory({ inFlightOf: () => 0, random: () => 0 });

		expect(factory('round_robin')).toBeInstanceOf(RoundRobinBalancer);
		expect(factory('least_connections')).toBeInstanceOf(LeastConnectionsBalancer);
		expect(factory('weighted_random')).toBeInstanceOf(WeightedRandomBalancer);
		expect(() => factory('fastest' as never)).toThrow();
	});
});
