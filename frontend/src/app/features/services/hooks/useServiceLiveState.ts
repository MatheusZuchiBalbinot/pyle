import { useCallback, useMemo, useState } from 'react';

import type { ChaosState, InstanceLiveState, Service } from '@/app/api/adminApiTypes';
import type { InstanceStateKind, InstanceStateName, RealtimeEvent } from '@/app/api/realtimeEvents';
import { useOptionalRealtimeSubscribe } from '@/app/core/realtime/useRealtime';

export type TimelineEntry = {
	readonly kind: InstanceStateKind;
	readonly toState: InstanceStateName;
	readonly reason: string;
	readonly occurredAt: string;
};

export type LiveOverrides = ReadonlyMap<string, InstanceOverride>;

export type ServiceLiveState = {
	readonly services: readonly Service[] | null;
	readonly timelineOf: (instanceId: string) => readonly TimelineEntry[];
};

type InstanceOverride = {
	readonly health?: InstanceLiveState['health'];
	readonly circuit?: InstanceLiveState['circuit'];
	readonly chaos?: ChaosState;
};

// Transitions kept per instance for its timeline: enough to read what just
// happened, bounded so a long session does not grow forever.
export const MAX_TIMELINE_ENTRIES = 20;

const CIRCUIT_BY_STATE: Readonly<Partial<Record<InstanceStateName, InstanceLiveState['circuit']>>> = {
	circuit_closed: 'closed',
	circuit_open: 'open',
	circuit_half_open: 'half_open',
};

const HEALTH_BY_STATE: Readonly<Partial<Record<InstanceStateName, InstanceLiveState['health']>>> = {
	healthy: 'healthy',
	unhealthy: 'unhealthy',
};

export function appendTimelineEntry(
	timeline: ReadonlyMap<string, readonly TimelineEntry[]>,
	instanceId: string,
	entry: TimelineEntry,
): ReadonlyMap<string, readonly TimelineEntry[]> {
	const next = new Map(timeline);

	next.set(instanceId, [entry, ...(timeline.get(instanceId) ?? [])].slice(0, MAX_TIMELINE_ENTRIES));

	return next;
}

export function useServiceLiveState(services: readonly Service[] | null): ServiceLiveState {
	const [overrides, setOverrides] = useState<LiveOverrides>(new Map());
	const [overridesBase, setOverridesBase] = useState(services);
	const [timeline, setTimeline] = useState<ReadonlyMap<string, readonly TimelineEntry[]>>(new Map());

	// Fresh data from the server already includes what the events said.
	if (services !== overridesBase) {
		setOverridesBase(services);
		setOverrides(new Map());
	}

	const handleEvent = useCallback((event: RealtimeEvent) => {
		const override = overrideFor(event);

		if (override === null) {
			return;
		}

		setOverrides((current) => withOverride(current, override.instanceId, override.change));

		if (event.type !== 'instance.state.changed') {
			return;
		}

		const entry: TimelineEntry = { kind: event.kind, toState: event.toState, reason: event.reason, occurredAt: event.occurredAt };

		setTimeline((current) => appendTimelineEntry(current, event.instanceId, entry));
	}, []);

	useOptionalRealtimeSubscribe(handleEvent);

	const timelineOf = useCallback((instanceId: string) => timeline.get(instanceId) ?? [], [timeline]);
	// Memoized: the page derives its cards from this array's identity.
	const liveServices = useMemo(() => (services === null ? null : applyLiveOverrides(services, overrides)), [services, overrides]);

	return { services: liveServices, timelineOf };
}

function withOverride(overrides: LiveOverrides, instanceId: string, change: InstanceOverride): LiveOverrides {
	const next = new Map(overrides);

	next.set(instanceId, { ...overrides.get(instanceId), ...change });

	return next;
}

function overrideFor(event: RealtimeEvent): { readonly instanceId: string; readonly change: InstanceOverride } | null {
	if (event.type === 'chaos.changed') {
		return { instanceId: event.instanceId, change: { chaos: event.chaos } };
	}

	if (event.type !== 'instance.state.changed') {
		return null;
	}

	const change: InstanceOverride =
		event.kind === 'health' ? { health: HEALTH_BY_STATE[event.toState] } : { circuit: CIRCUIT_BY_STATE[event.toState] };

	return { instanceId: event.instanceId, change };
}

// The badge changes the moment the event arrives, not at the next refetch.
function applyLiveOverrides(services: readonly Service[], overrides: LiveOverrides): readonly Service[] {
	if (overrides.size === 0) {
		return services;
	}

	return services.map((service) => ({
		...service,
		instances: service.instances.map((instance) => {
			const override = overrides.get(instance.id);

			if (!override) {
				return instance;
			}

			const baseLive: InstanceLiveState = instance.live ?? {
				instanceId: instance.id,
				gatewayId: '',
				health: 'unknown',
				circuit: 'closed',
				inFlight: 0,
				consecutiveFailures: 0,
				lastCheckAt: null,
				lastCheckLatencyMs: null,
				updatedAt: '',
			};
			const live: InstanceLiveState = { ...baseLive, health: override.health ?? baseLive.health, circuit: override.circuit ?? baseLive.circuit };

			return { ...instance, live, chaos: override.chaos ?? instance.chaos };
		}),
	}));
}
