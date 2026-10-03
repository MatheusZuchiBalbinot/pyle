import type { InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { LoadBalancer, SelectInstanceInput } from '../contracts/load-balancer.js';

export type InFlightCounter = (instanceId: string) => number;

// Ties take turns instead of always going to the first listed instance.
export class LeastConnectionsBalancer implements LoadBalancer {
	private cursor = 0;

	constructor(private readonly inFlightOf: InFlightCounter) {}

	select(input: SelectInstanceInput): InstanceConfig {
		const counts = input.candidates.map((instance) => this.inFlightOf(instance.id));
		const fewest = Math.min(...counts);
		const tied = input.candidates.filter((_instance, index) => counts[index] === fewest);
		const index = this.cursor % tied.length;

		this.cursor = (this.cursor + 1) % Number.MAX_SAFE_INTEGER;

		return tied[index];
	}
}
