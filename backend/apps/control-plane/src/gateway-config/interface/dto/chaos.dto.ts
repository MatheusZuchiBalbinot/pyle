import { IsBoolean, IsInt, IsNumber, Max, Min } from 'class-validator';

import { MAX_CHAOS_ERROR_RATE, MAX_CHAOS_JITTER_MS, MAX_CHAOS_LATENCY_MS } from '@pyle/shared/contracts/chaos-state.js';

// Faults to inject into a demo instance; all zero/false restores it.
export class ChaosStateDto {
	@IsInt()
	@Min(0)
	@Max(MAX_CHAOS_LATENCY_MS)
	latencyMs!: number;

	@IsInt()
	@Min(0)
	@Max(MAX_CHAOS_JITTER_MS)
	jitterMs!: number;

	// Fraction of requests answered with 500.
	@IsNumber()
	@Min(0)
	@Max(MAX_CHAOS_ERROR_RATE)
	errorRate!: number;

	@IsBoolean()
	isDown!: boolean;
}
