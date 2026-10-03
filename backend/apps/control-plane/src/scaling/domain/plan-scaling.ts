import type { ManagedInstanceState } from '@prisma/control-plane-client';

export type ManagedInstanceView = {
	readonly id: string;
	readonly scalingState: ManagedInstanceState | null;
	readonly createdAt: Date;
};

export type ScalingAction = { readonly kind: 'create' } | { readonly kind: 'remove'; readonly instanceId: string };

type ScalingPlanInput = {
	readonly desired: number;
	// The service's live managed instances (static ones are never passed).
	readonly instances: readonly ManagedInstanceView[];
};

// Failed ones are cleaned up, draining ones are already leaving, and scaling down removes
// the newest first.
export function planScaling(input: ScalingPlanInput): readonly ScalingAction[] {
	const cleanups: ScalingAction[] = input.instances
		.filter((instance) => instance.scalingState === 'failed')
		.map((instance) => ({ kind: 'remove', instanceId: instance.id }));
	const serving = input.instances.filter(isServing);
	const difference = input.desired - serving.length;

	if (difference >= 0) {
		const creations: ScalingAction[] = Array.from({ length: difference }, () => ({ kind: 'create' }));

		return [...cleanups, ...creations];
	}

	const removals: ScalingAction[] = [...serving]
		.sort(newestFirst)
		.slice(0, -difference)
		.map((instance) => ({ kind: 'remove', instanceId: instance.id }));

	return [...cleanups, ...removals];
}

function isServing(instance: ManagedInstanceView): boolean {
	return instance.scalingState === 'provisioning' || instance.scalingState === 'running';
}

function newestFirst(left: ManagedInstanceView, right: ManagedInstanceView): number {
	return right.createdAt.getTime() - left.createdAt.getTime();
}
