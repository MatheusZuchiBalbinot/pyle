import type { Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

// What a managed replica pill shows. `unhealthy` is a running container the gateway
// took out of rotation; `failed` is a container that never came up.
export type ReplicaState = 'running' | 'starting' | 'leaving' | 'unhealthy' | 'failed';

export type ReplicaSlot =
	| { readonly kind: 'replica'; readonly instance: ServiceInstance; readonly state: ReplicaState }
	// Asked for (the desired count is above what is serving) but no container yet.
	| { readonly kind: 'requested' }
	| { readonly kind: 'free' };

export type ReplicaOverview = {
	readonly slots: readonly ReplicaSlot[];
	readonly readyCount: number;
	readonly desiredCount: number;
	// The docker-compose instances, which always serve beside the managed ones.
	readonly fixedCount: number;
};

type RankedSlot = { readonly rank: number; readonly slot: ReplicaSlot };

// Pill order: what serves first, then what is coming, then what is broken or leaving.
const RANK_BY_STATE: Readonly<Record<ReplicaState, number>> = { running: 0, starting: 1, unhealthy: 3, failed: 4, leaving: 5 };
const REQUESTED_RANK = 2;

export function deriveReplicaState(instance: ServiceInstance): ReplicaState {
	const scalingState = instance.scalingState;

	if (scalingState === null || scalingState === 'provisioning') {
		return 'starting';
	}

	if (scalingState === 'draining') {
		return 'leaving';
	}

	if (scalingState === 'failed') {
		return 'failed';
	}

	if (scalingState === 'running') {
		return resolveRunningState(instance);
	}

	return assertUnreachable(scalingState);
}

// Mirrors the control plane's plan: failed replicas are replaced and draining ones are
// already leaving, so only starting and running ones count toward the desired number.
export function buildReplicaOverview(service: Service, maxManagedReplicas: number): ReplicaOverview {
	const desiredCount = service.scaling.desiredManagedReplicas;
	const managed = service.instances.filter(isManaged);
	const replicas = managed.map(toReplicaSlot);
	const servingCount = managed.filter(isServing).length;
	const requestedCount = Math.max(0, desiredCount - servingCount);
	const requested: readonly RankedSlot[] = Array.from({ length: requestedCount }, () => ({ rank: REQUESTED_RANK, slot: { kind: 'requested' } }));
	const occupied = [...replicas, ...requested].sort(byRank).map((ranked) => ranked.slot);
	const freeCount = Math.max(0, maxManagedReplicas - occupied.length);
	const free: readonly ReplicaSlot[] = Array.from({ length: freeCount }, () => ({ kind: 'free' }));
	const readyCount = managed.filter(isReady).length;
	const fixedCount = service.instances.length - managed.length;

	return { slots: [...occupied, ...free], readyCount, desiredCount, fixedCount };
}

function resolveRunningState(instance: ServiceInstance): ReplicaState {
	const live = instance.live;
	const isOutOfRotation = live?.health === 'unhealthy' || live?.circuit === 'open';

	return isOutOfRotation ? 'unhealthy' : 'running';
}

function isManaged(instance: ServiceInstance): boolean {
	return instance.source === 'managed';
}

function isReady(instance: ServiceInstance): boolean {
	return deriveReplicaState(instance) === 'running';
}

function isServing(instance: ServiceInstance): boolean {
	return instance.scalingState === 'provisioning' || instance.scalingState === 'running';
}

function toReplicaSlot(instance: ServiceInstance): RankedSlot {
	const state = deriveReplicaState(instance);

	return { rank: RANK_BY_STATE[state], slot: { kind: 'replica', instance, state } };
}

// Array.prototype.sort is stable, so equal ranks keep the server's (creation) order.
function byRank(left: RankedSlot, right: RankedSlot): number {
	return left.rank - right.rank;
}
