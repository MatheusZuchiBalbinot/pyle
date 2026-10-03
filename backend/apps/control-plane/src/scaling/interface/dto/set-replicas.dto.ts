import { IsInt, Max, Min } from 'class-validator';

import { MAX_MANAGED_REPLICAS } from '../../domain/scaling-limits.js';

export class SetReplicasDto {
	@IsInt()
	@Min(0)
	@Max(MAX_MANAGED_REPLICAS)
	managedReplicas!: number;
}
