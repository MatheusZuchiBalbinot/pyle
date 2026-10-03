import { useMutation, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, setServiceReplicas } from '@/app/api/adminApiClient';
import type { Service } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';

export type ServiceScaling = {
	// The number on the stepper.
	readonly target: number;
	// The number the control plane was last asked for (optimistically, while saving).
	readonly applied: number;
	readonly isDirty: boolean;
	readonly isSaving: boolean;
	readonly canDecrease: boolean;
	readonly canIncrease: boolean;
	readonly decrease: () => void;
	readonly increase: () => void;
	readonly cancel: () => void;
	readonly apply: () => void;
};

type ScalingSnapshot = { readonly previous: readonly Service[] | undefined; readonly previousApplied: number };

const SERVICES_KEY = queryKeys.configList('services');

// The services list with one service's desired count replaced: the pills show the new
// slots at once, before the control plane answers.
export function withDesiredReplicas(services: readonly Service[], serviceId: string, desiredManagedReplicas: number): readonly Service[] {
	return services.map((service) => {
		if (service.id !== serviceId) {
			return service;
		}

		return { ...service, scaling: { ...service.scaling, desiredManagedReplicas } };
	});
}

export function useServiceScaling(service: Service, maxManagedReplicas: number): ServiceScaling {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const queryClient = useQueryClient();
	const applied = service.scaling.desiredManagedReplicas;
	const [target, setTarget] = useState(applied);
	const [targetBase, setTargetBase] = useState(applied);

	// The server (or the optimistic write) moved the count: the stepper follows it.
	if (applied !== targetBase) {
		setTargetBase(applied);
		setTarget(applied);
	}

	async function snapshotAndApply(count: number): Promise<ScalingSnapshot> {
		const previousApplied = applied;

		await queryClient.cancelQueries({ queryKey: SERVICES_KEY });
		const previous = queryClient.getQueryData<readonly Service[]>(SERVICES_KEY);

		if (previous !== undefined) {
			queryClient.setQueryData(SERVICES_KEY, withDesiredReplicas(previous, service.id, count));
		}

		return { previous, previousApplied };
	}

	function handleSuccess(_result: Service, count: number): void {
		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Service', action: 'updated', id: service.id }));
		toast(t('services.scaling.applied', { service: service.name, count }), 'success');
	}

	function handleError(error: Error, _count: number, snapshot: ScalingSnapshot | undefined): void {
		rollback(queryClient, snapshot);

		// The stepper goes back too, whether or not a render saw the optimistic count.
		if (snapshot !== undefined) {
			setTarget(snapshot.previousApplied);
		}

		toast(error instanceof AdminApiError ? error.message : t('common.unexpectedError'), 'danger');
	}

	function handleSettled(): Promise<void> {
		return queryClient.invalidateQueries({ queryKey: SERVICES_KEY });
	}

	const mutationOptions: UseMutationOptions<Service, Error, number, ScalingSnapshot> = {
		// Realtime refetches of this list wait for the edit to settle (useRealtimeRefetch).
		mutationKey: SERVICES_KEY,
		mutationFn: (count) => setServiceReplicas(service.slug, count),
		onMutate: snapshotAndApply,
		onSuccess: handleSuccess,
		onError: handleError,
		onSettled: handleSettled,
	};
	const mutation = useMutation(mutationOptions);
	const isSaving = mutation.isPending;

	function decrease(): void {
		setTarget((value) => Math.max(0, value - 1));
	}

	function increase(): void {
		setTarget((value) => Math.min(maxManagedReplicas, value + 1));
	}

	function cancel(): void {
		setTarget(applied);
	}

	function apply(): void {
		mutation.mutate(target);
	}

	return {
		target,
		applied,
		isDirty: target !== applied,
		isSaving,
		canDecrease: !isSaving && target > 0,
		canIncrease: !isSaving && target < maxManagedReplicas,
		decrease,
		increase,
		cancel,
		apply,
	};
}

function rollback(queryClient: QueryClient, snapshot: ScalingSnapshot | undefined): void {
	if (snapshot?.previous === undefined) {
		return;
	}

	queryClient.setQueryData(SERVICES_KEY, snapshot.previous);
}
