import type { InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { LoadBalancer, SelectInstanceInput } from '../contracts/load-balancer.js';

export type RandomSource = () => number;

export class WeightedRandomBalancer implements LoadBalancer {
	constructor(private readonly random: RandomSource = Math.random) {}

	select(input: SelectInstanceInput): InstanceConfig {
		const totalWeight = input.candidates.reduce((sum, instance) => sum + instance.weight, 0);
		let remaining = this.random() * totalWeight;

		for (const instance of input.candidates) {
			remaining -= instance.weight;

			if (remaining < 0) {
				return instance;
			}
		}

		// Only reachable through floating point rounding at the very top.
		return input.candidates[input.candidates.length - 1];
	}
}
