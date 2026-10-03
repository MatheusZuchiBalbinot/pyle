import type { HealthCheckConfig } from '@pyle/shared/contracts/config-snapshot.js';
import type { InstanceHealthStatus } from '@pyle/shared/contracts/instance-live-state.js';

export type HealthState = {
	readonly status: InstanceHealthStatus;
	readonly consecutiveSuccesses: number;
	readonly consecutiveFailures: number;
};

export type HealthThresholds = Pick<HealthCheckConfig, 'healthyThreshold' | 'unhealthyThreshold'>;

export const INITIAL_HEALTH_STATE: HealthState = { status: 'unknown', consecutiveSuccesses: 0, consecutiveFailures: 0 };

// One active health check result applied to an instance's health.
export function applyProbeResult(state: HealthState, isSuccess: boolean, thresholds: HealthThresholds): HealthState {
	if (isSuccess) {
		const consecutiveSuccesses = state.consecutiveSuccesses + 1;

		return { status: statusAfterSuccess(state, consecutiveSuccesses, thresholds), consecutiveSuccesses, consecutiveFailures: 0 };
	}

	const consecutiveFailures = state.consecutiveFailures + 1;

	return { status: statusAfterFailure(state, consecutiveFailures, thresholds), consecutiveSuccesses: 0, consecutiveFailures };
}

// A fresh gateway serves an instance after its first good check instead of
// waiting for the full threshold; only a known-bad one has to earn it back.
function statusAfterSuccess(state: HealthState, consecutiveSuccesses: number, thresholds: HealthThresholds): InstanceHealthStatus {
	if (state.status !== 'unhealthy') {
		return 'healthy';
	}

	if (consecutiveSuccesses >= thresholds.healthyThreshold) {
		return 'healthy';
	}

	return 'unhealthy';
}

function statusAfterFailure(state: HealthState, consecutiveFailures: number, thresholds: HealthThresholds): InstanceHealthStatus {
	if (consecutiveFailures >= thresholds.unhealthyThreshold) {
		return 'unhealthy';
	}

	return state.status;
}
