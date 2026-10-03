export type ChaosState = {
	readonly latencyMs: number;
	readonly jitterMs: number;
	// Fraction of requests answered with 500, 0..1.
	readonly errorRate: number;
	// Answers 503 to everything, health checks included.
	readonly isDown: boolean;
};

export const MAX_CHAOS_LATENCY_MS = 30_000;
export const MAX_CHAOS_JITTER_MS = 10_000;
export const MAX_CHAOS_ERROR_RATE = 1;

export const NO_CHAOS: ChaosState = { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false };

export function hasActiveChaos(chaos: ChaosState): boolean {
	return chaos.latencyMs > 0 || chaos.jitterMs > 0 || chaos.errorRate > 0 || chaos.isDown;
}
