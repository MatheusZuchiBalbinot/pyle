import type { GatewayConfigSnapshot } from '@pyle/shared/contracts/config-snapshot.js';
import type { InstanceStateKindName, InstanceStateName } from '@pyle/shared/contracts/names.js';

import type { AttemptObserver, AttemptOutcome } from '../contracts/attempt-observer.js';
import type { GatewayEventSink } from '../contracts/gateway-event-sink.js';
import type { InstanceAvailability } from '../contracts/instance-availability.js';
import type { InstanceRuntimeState, InstanceStateSource } from '../contracts/instance-state-source.js';
import {
	INITIAL_CIRCUIT_STATE,
	isPassable,
	onRequestResult,
	onRequestStart,
	type CircuitConfig,
	type CircuitSignal,
	type CircuitState,
} from './circuit-breaker.js';
import { applyProbeResult, INITIAL_HEALTH_STATE, type HealthState, type HealthThresholds } from './health-state-machine.js';
import type { ProbeResult } from './probe-result.js';

const FAILING_STATUS_FLOOR = 500;

type InstanceStateTrackerOptions = {
	readonly gatewayId: string;
	// Resolved at emit time: the sink comes from another extension.
	readonly eventSink: () => GatewayEventSink;
	readonly now: () => number;
};

type Entry = {
	readonly thresholds: HealthThresholds;
	readonly circuitConfig: CircuitConfig;
	readonly health: HealthState;
	readonly circuit: CircuitState;
	readonly inFlight: number;
	readonly lastCheckAt: number | null;
	readonly lastCheckLatencyMs: number | null;
	// The circuit's reason to open: the last failure it counted.
	readonly lastFailureDetail: string | null;
};

type Transition = {
	readonly kind: InstanceStateKindName;
	readonly fromState: InstanceStateName;
	readonly toState: InstanceStateName;
	readonly reason: string;
};

type StateListener = (state: InstanceRuntimeState) => void;

function describeOutcome(outcome: AttemptOutcome): string {
	if (outcome.kind === 'response') {
		return `HTTP ${outcome.status}`;
	}

	if (outcome.kind === 'connection_error') {
		return outcome.errorCode;
	}

	return outcome.kind;
}

// 4xx is the client's mistake, not the instance's; a client that went away
// says nothing about either.
function circuitSignalFor(outcome: AttemptOutcome): CircuitSignal {
	if (outcome.kind === 'aborted') {
		return 'neutral';
	}

	if (outcome.kind === 'response') {
		return outcome.status >= FAILING_STATUS_FLOOR ? 'failure' : 'success';
	}

	return 'failure';
}

const CIRCUIT_STATE_NAMES: Readonly<Record<CircuitState['status'], InstanceStateName>> = {
	closed: 'circuit_closed',
	open: 'circuit_open',
	half_open: 'circuit_half_open',
};

// Per process on purpose: each gateway judges instances by what it sees (ADR 6).
export class InstanceStateTracker implements InstanceAvailability, AttemptObserver, InstanceStateSource {
	private readonly entries = new Map<string, Entry>();
	private readonly listeners = new Set<StateListener>();

	constructor(private readonly options: InstanceStateTrackerOptions) {}

	syncInstances(snapshot: GatewayConfigSnapshot): void {
		const current = new Set<string>();

		for (const service of snapshot.services) {
			const thresholds: HealthThresholds = service.healthCheck;

			for (const instance of service.instances) {
				current.add(instance.id);
				const existing = this.entries.get(instance.id);
				const entry = existing ? { ...existing, thresholds, circuitConfig: service.circuit } : newEntry(thresholds, service.circuit);

				this.entries.set(instance.id, entry);
			}
		}

		for (const instanceId of this.entries.keys()) {
			if (!current.has(instanceId)) {
				this.entries.delete(instanceId);
			}
		}
	}

	// Unknown health counts as available: a fresh gateway serves before its
	// first check. An instance not in the configuration is never asked.
	isAvailable(instanceId: string): boolean {
		const entry = this.entries.get(instanceId);

		if (!entry) {
			return true;
		}

		const isHealthy = entry.health.status !== 'unhealthy';

		return isHealthy && isPassable(entry.circuit, entry.circuitConfig, this.options.now());
	}

	onAttemptStart(instanceId: string): void {
		const entry = this.entries.get(instanceId);

		if (!entry) {
			return;
		}

		const circuit = onRequestStart(entry.circuit, entry.circuitConfig, this.options.now());

		this.update(instanceId, entry, { ...entry, circuit, inFlight: entry.inFlight + 1 }, null);
	}

	onAttemptEnd(instanceId: string, outcome: AttemptOutcome): void {
		const entry = this.entries.get(instanceId);

		if (!entry) {
			return;
		}

		const signal = circuitSignalFor(outcome);
		const lastFailureDetail = signal === 'failure' ? describeOutcome(outcome) : entry.lastFailureDetail;
		const circuit = onRequestResult(entry.circuit, signal, entry.circuitConfig, this.options.now());
		const next: Entry = { ...entry, circuit, inFlight: Math.max(0, entry.inFlight - 1), lastFailureDetail };

		this.update(instanceId, entry, next, null);
	}

	// A check that finishes after its instance left the configuration is
	// dropped: it must not bring the state back.
	recordProbe(instanceId: string, result: ProbeResult): void {
		const entry = this.entries.get(instanceId);

		if (!entry) {
			return;
		}

		const health = applyProbeResult(entry.health, result.isSuccess, entry.thresholds);
		const next: Entry = { ...entry, health, lastCheckAt: this.options.now(), lastCheckLatencyMs: result.latencyMs };

		this.update(instanceId, entry, next, healthTransition(entry.health, health, result.detail, entry.thresholds));
	}

	inFlightOf(instanceId: string): number {
		return this.entries.get(instanceId)?.inFlight ?? 0;
	}

	list(): readonly InstanceRuntimeState[] {
		return [...this.entries.entries()].map(([instanceId, entry]) => this.toRuntimeState(instanceId, entry));
	}

	// Called on every health or circuit transition and after every check
	// (not per request: in-flight counts are read with list()).
	onChange(listener: StateListener): () => void {
		this.listeners.add(listener);

		return () => this.listeners.delete(listener);
	}

	get size(): number {
		return this.entries.size;
	}

	private update(instanceId: string, before: Entry, after: Entry, healthChange: Transition | null): void {
		this.entries.set(instanceId, after);
		const circuitChange = circuitTransition(before.circuit, after.circuit, after.lastFailureDetail, after.circuitConfig);

		for (const transition of [healthChange, circuitChange]) {
			if (transition) {
				this.emit(instanceId, transition);
			}
		}

		const isChecked = after.lastCheckAt !== before.lastCheckAt;
		const hasChanged = isChecked || before.health.status !== after.health.status || circuitChange !== null;

		if (!hasChanged) {
			return;
		}

		const state = this.toRuntimeState(instanceId, after);

		for (const listener of this.listeners) {
			listener(state);
		}
	}

	private emit(instanceId: string, transition: Transition): void {
		const occurredAt = new Date(this.options.now()).toISOString();

		this.options.eventSink().emit({ type: 'instance.state.changed', gatewayId: this.options.gatewayId, instanceId, ...transition, occurredAt });
	}

	private toRuntimeState(instanceId: string, entry: Entry): InstanceRuntimeState {
		return {
			instanceId,
			health: entry.health.status,
			circuit: entry.circuit.status,
			inFlight: entry.inFlight,
			consecutiveFailures: entry.health.consecutiveFailures,
			lastCheckAt: entry.lastCheckAt,
			lastCheckLatencyMs: entry.lastCheckLatencyMs,
		};
	}
}

// An instance nobody checked yet is already in rotation, so leaving it is
// reported as leaving "healthy". Entering "healthy" from unknown is the
// normal boot and reports nothing (no notification per instance per boot).
function healthTransition(before: HealthState, after: HealthState, detail: string, thresholds: HealthThresholds): Transition | null {
	if (before.status === after.status) {
		return null;
	}

	if (after.status === 'unhealthy') {
		const reason = `${after.consecutiveFailures} consecutive failed health checks (${detail})`;

		return { kind: 'health', fromState: 'healthy', toState: 'unhealthy', reason };
	}

	if (before.status === 'unknown') {
		return null;
	}

	const reason = `${thresholds.healthyThreshold} consecutive successful health checks`;

	return { kind: 'health', fromState: 'unhealthy', toState: 'healthy', reason };
}

function circuitReason(before: CircuitState, after: CircuitState, failureDetail: string | null, config: CircuitConfig): string {
	if (after.status === 'half_open') {
		return 'cooldown elapsed, probing';
	}

	if (after.status === 'closed') {
		return 'probe request succeeded';
	}

	if (before.status === 'half_open') {
		return `probe request failed (${failureDetail})`;
	}

	return `${config.failureThreshold} consecutive request failures (${failureDetail})`;
}

function circuitTransition(before: CircuitState, after: CircuitState, failureDetail: string | null, config: CircuitConfig): Transition | null {
	if (before.status === after.status) {
		return null;
	}

	const reason = circuitReason(before, after, failureDetail, config);

	return { kind: 'circuit', fromState: CIRCUIT_STATE_NAMES[before.status], toState: CIRCUIT_STATE_NAMES[after.status], reason };
}

function newEntry(thresholds: HealthThresholds, circuitConfig: CircuitConfig): Entry {
	return {
		thresholds,
		circuitConfig,
		health: INITIAL_HEALTH_STATE,
		circuit: INITIAL_CIRCUIT_STATE,
		inFlight: 0,
		lastCheckAt: null,
		lastCheckLatencyMs: null,
		lastFailureDetail: null,
	};
}
