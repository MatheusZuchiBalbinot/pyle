import { describe, expect, it } from 'vitest';

import { applyProbeResult, INITIAL_HEALTH_STATE, type HealthState } from './health-state-machine.js';

const THRESHOLDS = { healthyThreshold: 2, unhealthyThreshold: 3 };

function applyAll(results: readonly boolean[], from: HealthState = INITIAL_HEALTH_STATE): HealthState {
	return results.reduce((state, isSuccess) => applyProbeResult(state, isSuccess, THRESHOLDS), from);
}

describe('applyProbeResult', () => {
	it.each([
		{ name: 'unknown turns healthy on the first success', results: [true], status: 'healthy' },
		{ name: 'unknown stays unknown below the failure threshold', results: [false, false], status: 'unknown' },
		{ name: 'unknown turns unhealthy at the failure threshold', results: [false, false, false], status: 'unhealthy' },
		{ name: 'healthy survives failures below the threshold', results: [true, false, false], status: 'healthy' },
		{ name: 'healthy turns unhealthy at the failure threshold', results: [true, false, false, false], status: 'unhealthy' },
		{ name: 'a success in between resets the failure count', results: [true, false, false, true, false, false], status: 'healthy' },
		{ name: 'unhealthy needs the success threshold to come back', results: [false, false, false, true], status: 'unhealthy' },
		{ name: 'unhealthy turns healthy at the success threshold', results: [false, false, false, true, true], status: 'healthy' },
		{ name: 'a failure in between resets the success count', results: [false, false, false, true, false, true], status: 'unhealthy' },
	])('$name', ({ results, status }) => {
		expect(applyAll(results).status).toBe(status);
	});

	it('counts streaks and resets the opposite one', () => {
		expect(applyAll([true, true, false])).toEqual({ status: 'healthy', consecutiveSuccesses: 0, consecutiveFailures: 1 });
		expect(applyAll([false, true, true])).toEqual({ status: 'healthy', consecutiveSuccesses: 2, consecutiveFailures: 0 });
	});
});
