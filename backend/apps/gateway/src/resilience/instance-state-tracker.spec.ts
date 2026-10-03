import { describe, expect, it } from 'vitest';

import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';

import type { InstanceRuntimeState } from '../contracts/instance-state-source.js';
import { buildInstance, buildTestSnapshot } from '../testing/build-test-snapshot.js';
import { InstanceStateTracker } from './instance-state-tracker.js';

const A = buildInstance('a');
const B = buildInstance('b');
const HEALTH = { path: '/health', intervalMs: 5000, timeoutMs: 2000, healthyThreshold: 2, unhealthyThreshold: 2 };
const CIRCUIT = { failureThreshold: 2, cooldownMs: 1000 };
const SNAPSHOT = buildTestSnapshot({ instances: [A, B], service: { healthCheck: HEALTH, circuit: CIRCUIT } });
const OK = { isSuccess: true, latencyMs: 5, detail: 'HTTP 200' };
const DOWN = { isSuccess: false, latencyMs: 5, detail: 'HTTP 503' };

function build() {
	let now = 0;
	const events: GatewayEvent[] = [];
	const tracker = new InstanceStateTracker({ gatewayId: 'gw', eventSink: () => ({ emit: (event) => events.push(event) }), now: () => now });

	tracker.syncInstances(SNAPSHOT);

	return { tracker, events, advance: (ms: number) => (now += ms) };
}

function transitions(events: readonly GatewayEvent[]) {
	return events.map((event) => (event.type === 'instance.state.changed' ? [event.kind, event.fromState, event.toState, event.reason] : event.type));
}

describe('InstanceStateTracker', () => {
	it('treats instances nobody checked yet as available, and unconfigured ones too', () => {
		const { tracker } = build();

		expect(tracker.isAvailable(A.id)).toBe(true);
		expect(tracker.isAvailable('not-configured')).toBe(true);
		expect(tracker.list().map((state) => state.health)).toEqual(['unknown', 'unknown']);
	});

	it('ejects an instance after failed checks and brings it back after good ones, one event each way', () => {
		const { tracker, events } = build();

		tracker.recordProbe(A.id, OK);
		tracker.recordProbe(A.id, DOWN);
		tracker.recordProbe(A.id, DOWN);
		expect(tracker.isAvailable(A.id)).toBe(false);
		tracker.recordProbe(A.id, OK);
		tracker.recordProbe(A.id, OK);

		expect(tracker.isAvailable(A.id)).toBe(true);
		expect(transitions(events)).toEqual([
			['health', 'healthy', 'unhealthy', '2 consecutive failed health checks (HTTP 503)'],
			['health', 'unhealthy', 'healthy', '2 consecutive successful health checks'],
		]);
	});

	it('reports an instance that was never healthy as leaving healthy', () => {
		const { tracker, events } = build();

		tracker.recordProbe(A.id, DOWN);
		tracker.recordProbe(A.id, DOWN);

		expect(transitions(events)).toEqual([['health', 'healthy', 'unhealthy', '2 consecutive failed health checks (HTTP 503)']]);
	});

	it('opens the circuit on request failures, probes after the cooldown and closes on success', () => {
		const { tracker, events, advance } = build();

		for (const outcome of [{ kind: 'timeout' }, { kind: 'response', status: 502 }] as const) {
			tracker.onAttemptStart(A.id);
			tracker.onAttemptEnd(A.id, outcome);
		}

		expect(tracker.isAvailable(A.id)).toBe(false);

		advance(CIRCUIT.cooldownMs);
		expect(tracker.isAvailable(A.id)).toBe(true);
		tracker.onAttemptStart(A.id);
		expect(tracker.isAvailable(A.id)).toBe(false);
		tracker.onAttemptEnd(A.id, { kind: 'response', status: 200 });

		expect(tracker.isAvailable(A.id)).toBe(true);
		expect(transitions(events)).toEqual([
			['circuit', 'circuit_closed', 'circuit_open', '2 consecutive request failures (HTTP 502)'],
			['circuit', 'circuit_open', 'circuit_half_open', 'cooldown elapsed, probing'],
			['circuit', 'circuit_half_open', 'circuit_closed', 'probe request succeeded'],
		]);
	});

	it('reopens when the probe fails, naming the failure', () => {
		const { tracker, events, advance } = build();

		for (let index = 0; index < CIRCUIT.failureThreshold; index++) {
			tracker.onAttemptStart(A.id);
			tracker.onAttemptEnd(A.id, { kind: 'connection_error', errorCode: 'ECONNREFUSED' });
		}

		advance(CIRCUIT.cooldownMs);

		tracker.onAttemptStart(A.id);
		tracker.onAttemptEnd(A.id, { kind: 'connection_error', errorCode: 'ECONNRESET' });

		expect(transitions(events).at(-1)).toEqual(['circuit', 'circuit_half_open', 'circuit_open', 'probe request failed (ECONNRESET)']);
	});

	it('does not count client errors or clients that left against the instance', () => {
		const { tracker } = build();

		for (const outcome of [{ kind: 'response', status: 404 }, { kind: 'aborted' }, { kind: 'aborted' }] as const) {
			tracker.onAttemptStart(A.id);
			tracker.onAttemptEnd(A.id, outcome);
		}

		expect(tracker.isAvailable(A.id)).toBe(true);
	});

	it('counts requests in flight and never below zero', () => {
		const { tracker } = build();

		tracker.onAttemptStart(A.id);
		tracker.onAttemptStart(A.id);
		expect(tracker.inFlightOf(A.id)).toBe(2);
		tracker.onAttemptEnd(A.id, { kind: 'aborted' });
		tracker.onAttemptEnd(A.id, { kind: 'aborted' });
		tracker.onAttemptEnd(A.id, { kind: 'aborted' });

		expect(tracker.inFlightOf(A.id)).toBe(0);
		expect(tracker.inFlightOf('gone')).toBe(0);
	});

	it('tells listeners about checks and transitions, not about every request', () => {
		const { tracker } = build();
		const seen: InstanceRuntimeState[] = [];
		const unsubscribe = tracker.onChange((state) => seen.push(state));

		tracker.onAttemptStart(A.id);
		tracker.onAttemptEnd(A.id, { kind: 'response', status: 200 });
		tracker.recordProbe(A.id, OK);
		unsubscribe();
		tracker.recordProbe(A.id, OK);

		expect(seen).toEqual([
			{ instanceId: A.id, health: 'healthy', circuit: 'closed', inFlight: 0, consecutiveFailures: 0, lastCheckAt: 0, lastCheckLatencyMs: 5 },
		]);
	});

	it('forgets removed instances and ignores late results for them', () => {
		const { tracker, events } = build();

		tracker.syncInstances(buildTestSnapshot({ instances: [A], service: { healthCheck: HEALTH, circuit: CIRCUIT } }));

		tracker.recordProbe(B.id, DOWN);
		tracker.recordProbe(B.id, DOWN);
		tracker.onAttemptStart(B.id);
		tracker.onAttemptEnd(B.id, { kind: 'timeout' });

		expect(tracker.size).toBe(1);
		expect(events).toEqual([]);
	});

	it('keeps state across reloads and applies new thresholds from the next evaluation', () => {
		const { tracker } = build();

		tracker.recordProbe(A.id, DOWN);
		const stricter = { ...HEALTH, unhealthyThreshold: 5 };

		tracker.syncInstances(buildTestSnapshot({ instances: [A, B], service: { healthCheck: stricter, circuit: CIRCUIT } }));
		tracker.recordProbe(A.id, DOWN);

		expect(tracker.list().find((state) => state.instanceId === A.id)).toMatchObject({ health: 'unknown', consecutiveFailures: 2 });
	});
});
