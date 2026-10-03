import type { InstanceConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { LoadBalancer, SelectInstanceInput } from '../contracts/load-balancer.js';

// The cursor is per service and survives reloads; as candidates come and go it keeps
// turning over whatever is left.
export class RoundRobinBalancer implements LoadBalancer {
	private cursor = 0;

	select(input: SelectInstanceInput): InstanceConfig {
		const index = this.cursor % input.candidates.length;

		this.cursor = (this.cursor + 1) % Number.MAX_SAFE_INTEGER;

		return input.candidates[index];
	}
}
