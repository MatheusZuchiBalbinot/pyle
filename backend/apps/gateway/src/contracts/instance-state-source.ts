import type { InstanceCircuitStatus, InstanceHealthStatus } from '@pyle/shared/contracts/instance-live-state.js';

export type InstanceRuntimeState = {
	readonly instanceId: string;
	readonly health: InstanceHealthStatus;
	readonly circuit: InstanceCircuitStatus;
	readonly inFlight: number;
	readonly consecutiveFailures: number;
	readonly lastCheckAt: number | null;
	readonly lastCheckLatencyMs: number | null;
};

export interface InstanceStateSource {
	list(): readonly InstanceRuntimeState[];
	onChange(listener: (state: InstanceRuntimeState) => void): () => void;
}

export class EmptyInstanceStateSource implements InstanceStateSource {
	list(): readonly InstanceRuntimeState[] {
		return [];
	}

	onChange(): () => void {
		return () => undefined;
	}
}
