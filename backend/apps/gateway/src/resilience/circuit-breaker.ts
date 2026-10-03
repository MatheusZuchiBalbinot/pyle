import type { CircuitConfig } from '@pyle/shared/contracts/config-snapshot.js';

export type CircuitState =
	| { readonly status: 'closed'; readonly consecutiveFailures: number }
	| { readonly status: 'open'; readonly openedAt: number }
	| { readonly status: 'half_open'; readonly isProbeInFlight: boolean };

export type { CircuitConfig };

// What a finished request says about the instance. A client that went
// away says nothing either way.
export type CircuitSignal = 'success' | 'failure' | 'neutral';

export const INITIAL_CIRCUIT_STATE: CircuitState = { status: 'closed', consecutiveFailures: 0 };

// Read-only: whether a new request may go to the instance. Candidate
// filtering calls it for instances it then does not pick, so it must not
// spend the half-open probe; onRequestStart does.
export function isPassable(state: CircuitState, config: CircuitConfig, now: number): boolean {
	if (state.status === 'closed') {
		return true;
	}

	if (state.status === 'open') {
		return hasCooledDown(state.openedAt, config, now);
	}

	return !state.isProbeInFlight;
}

// A request was sent to the instance. After the cooldown the first one is
// the probe; while it is out, nothing else passes.
export function onRequestStart(state: CircuitState, config: CircuitConfig, now: number): CircuitState {
	if (state.status === 'closed') {
		return state;
	}

	if (state.status === 'open' && !hasCooledDown(state.openedAt, config, now)) {
		return state;
	}

	return { status: 'half_open', isProbeInFlight: true };
}

// A request to the instance finished. A result arriving while open comes
// from a request sent before the circuit opened: it changes nothing.
export function onRequestResult(state: CircuitState, signal: CircuitSignal, config: CircuitConfig, now: number): CircuitState {
	if (state.status === 'closed') {
		return afterClosedResult(state, signal, config, now);
	}

	if (state.status === 'open') {
		return state;
	}

	return afterProbeResult(signal, now);
}

function hasCooledDown(openedAt: number, config: CircuitConfig, now: number): boolean {
	return now - openedAt >= config.cooldownMs;
}

function afterClosedResult(
	state: Extract<CircuitState, { status: 'closed' }>,
	signal: CircuitSignal,
	config: CircuitConfig,
	now: number,
): CircuitState {
	if (signal === 'neutral') {
		return state;
	}

	if (signal === 'success') {
		return INITIAL_CIRCUIT_STATE;
	}

	const consecutiveFailures = state.consecutiveFailures + 1;

	if (consecutiveFailures >= config.failureThreshold) {
		return { status: 'open', openedAt: now };
	}

	return { status: 'closed', consecutiveFailures };
}

function afterProbeResult(signal: CircuitSignal, now: number): CircuitState {
	if (signal === 'success') {
		return INITIAL_CIRCUIT_STATE;
	}

	if (signal === 'failure') {
		return { status: 'open', openedAt: now };
	}

	return { status: 'half_open', isProbeInFlight: false };
}
