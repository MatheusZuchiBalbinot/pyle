import { describe, expect, it } from 'vitest';

import { INITIAL_CIRCUIT_STATE, isPassable, onRequestResult, onRequestStart, type CircuitSignal, type CircuitState } from './circuit-breaker.js';

const CONFIG = { failureThreshold: 3, cooldownMs: 1000 };

function feed(signals: readonly CircuitSignal[], now = 0, from: CircuitState = INITIAL_CIRCUIT_STATE): CircuitState {
	return signals.reduce((state, signal) => onRequestResult(state, signal, CONFIG, now), from);
}

describe('circuit breaker', () => {
	it('opens at the failure threshold, not before', () => {
		expect(feed(['failure', 'failure'])).toEqual({ status: 'closed', consecutiveFailures: 2 });
		expect(feed(['failure', 'failure', 'failure'], 50)).toEqual({ status: 'open', openedAt: 50 });
	});

	it('resets the count on a success and ignores neutral results', () => {
		expect(feed(['failure', 'failure', 'success', 'failure', 'neutral'])).toEqual({ status: 'closed', consecutiveFailures: 1 });
	});

	it('refuses while open and lets a probe through after the cooldown', () => {
		const open: CircuitState = { status: 'open', openedAt: 0 };

		expect(isPassable(open, CONFIG, 999)).toBe(false);
		expect(onRequestStart(open, CONFIG, 999)).toBe(open);
		expect(isPassable(open, CONFIG, 1000)).toBe(true);
		expect(onRequestStart(open, CONFIG, 1000)).toEqual({ status: 'half_open', isProbeInFlight: true });
	});

	it('lets only one probe out at a time', () => {
		const probing: CircuitState = { status: 'half_open', isProbeInFlight: true };

		expect(isPassable(probing, CONFIG, 5000)).toBe(false);
		expect(isPassable({ status: 'half_open', isProbeInFlight: false }, CONFIG, 5000)).toBe(true);
	});

	it('closes when the probe succeeds and reopens when it fails', () => {
		const probing: CircuitState = { status: 'half_open', isProbeInFlight: true };

		expect(onRequestResult(probing, 'success', CONFIG, 2000)).toEqual(INITIAL_CIRCUIT_STATE);
		expect(onRequestResult(probing, 'failure', CONFIG, 2000)).toEqual({ status: 'open', openedAt: 2000 });
	});

	it('frees the probe slot when the probing client went away', () => {
		const probing: CircuitState = { status: 'half_open', isProbeInFlight: true };

		expect(onRequestResult(probing, 'neutral', CONFIG, 2000)).toEqual({ status: 'half_open', isProbeInFlight: false });
	});

	it('ignores late results while open, and leaves closed alone on start', () => {
		const open: CircuitState = { status: 'open', openedAt: 0 };

		expect(onRequestResult(open, 'success', CONFIG, 10)).toBe(open);
		expect(onRequestStart(INITIAL_CIRCUIT_STATE, CONFIG, 10)).toBe(INITIAL_CIRCUIT_STATE);
		expect(isPassable(INITIAL_CIRCUIT_STATE, CONFIG, 10)).toBe(true);
	});
});
