import { useMutation, useQueryClient, type QueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AdminApiError, updateInstance, updateService } from '@/app/api/adminApiClient';
import type { InstanceWarning, LoadBalancingStrategy, Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

// One field of a service or of one of its instances, set from a control on the card.
export type ServiceUpdate =
	| { readonly kind: 'strategy'; readonly service: Service; readonly strategy: LoadBalancingStrategy }
	| { readonly kind: 'weight'; readonly service: Service; readonly instance: ServiceInstance; readonly weight: number }
	| { readonly kind: 'enabled'; readonly service: Service; readonly instance: ServiceInstance; readonly isEnabled: boolean };

// A failure was already reported (rolled back, with a toast): callers only branch on it.
export type ServiceUpdateOutcome = { readonly status: 'applied'; readonly warning: InstanceWarning | null } | { readonly status: 'failed' };

export type OptimisticServiceUpdate = {
	readonly apply: (update: ServiceUpdate) => Promise<ServiceUpdateOutcome>;
};

type ServicesSnapshot = { readonly previous: readonly Service[] | undefined };

const SERVICES_KEY = queryKeys.configList('services');

// The services list with the update applied: what the server will answer once it agrees.
export function withServiceUpdate(services: readonly Service[], update: ServiceUpdate): readonly Service[] {
	return services.map((service) => {
		if (service.id !== update.service.id) {
			return service;
		}

		return applyToService(service, update);
	});
}

// The control shows the new value on the click; a failure restores the field and says why,
// and the refetch on settle confirms whatever the server holds.
export function useOptimisticServiceUpdate(): OptimisticServiceUpdate {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const queryClient = useQueryClient();

	async function snapshotAndApply(update: ServiceUpdate): Promise<ServicesSnapshot> {
		await queryClient.cancelQueries({ queryKey: SERVICES_KEY });
		const previous = queryClient.getQueryData<readonly Service[]>(SERVICES_KEY);

		if (previous !== undefined) {
			queryClient.setQueryData(SERVICES_KEY, withServiceUpdate(previous, update));
		}

		return { previous };
	}

	// Other screens (activity, routes) listen for the local event too.
	function handleSuccess(_warning: InstanceWarning | null, update: ServiceUpdate): void {
		const isInstanceUpdate = update.kind !== 'strategy';
		const entity = isInstanceUpdate ? 'ServiceInstance' : 'Service';
		const id = isInstanceUpdate ? update.instance.id : update.service.id;

		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity, action: 'updated', id }));
	}

	function handleError(error: Error, update: ServiceUpdate, snapshot: ServicesSnapshot | undefined): void {
		rollback(queryClient, update, snapshot);
		toast(error instanceof AdminApiError ? error.message : t('common.unexpectedError'), 'danger');
	}

	function handleSettled(): Promise<void> {
		return queryClient.invalidateQueries({ queryKey: SERVICES_KEY });
	}

	const mutationOptions: UseMutationOptions<InstanceWarning | null, Error, ServiceUpdate, ServicesSnapshot> = {
		// Realtime refetches of this list wait for the edit to settle (useRealtimeRefetch).
		mutationKey: SERVICES_KEY,
		mutationFn: sendUpdate,
		onMutate: snapshotAndApply,
		onSuccess: handleSuccess,
		onError: handleError,
		onSettled: handleSettled,
	};
	const { mutateAsync } = useMutation(mutationOptions);

	async function apply(update: ServiceUpdate): Promise<ServiceUpdateOutcome> {
		try {
			const warning = await mutateAsync(update);

			return { status: 'applied', warning };
		} catch {
			// handleError already rolled the field back and showed the reason.
			return { status: 'failed' };
		}
	}

	return { apply };
}

async function sendUpdate(update: ServiceUpdate): Promise<InstanceWarning | null> {
	const { slug } = update.service;

	if (update.kind === 'strategy') {
		await updateService(slug, { lbStrategy: update.strategy });

		return null;
	}

	if (update.kind === 'weight') {
		const { warning } = await updateInstance(slug, update.instance.id, { weight: update.weight });

		return warning;
	}

	if (update.kind === 'enabled') {
		const { warning } = await updateInstance(slug, update.instance.id, { isEnabled: update.isEnabled });

		return warning;
	}

	return assertUnreachable(update);
}

function applyToService(service: Service, update: ServiceUpdate): Service {
	if (update.kind === 'strategy') {
		return { ...service, lbStrategy: update.strategy };
	}

	if (update.kind === 'weight') {
		return withInstance(service, update.instance.id, { weight: update.weight });
	}

	if (update.kind === 'enabled') {
		return withInstance(service, update.instance.id, { isEnabled: update.isEnabled });
	}

	return assertUnreachable(update);
}

function withInstance(service: Service, instanceId: string, patch: Partial<ServiceInstance>): Service {
	const instances = service.instances.map((instance) => (instance.id === instanceId ? { ...instance, ...patch } : instance));

	return { ...service, instances };
}

// Only the field this update touched goes back, so another change still in flight keeps
// its optimistic value.
function rollback(queryClient: QueryClient, update: ServiceUpdate, snapshot: ServicesSnapshot | undefined): void {
	const previousService = snapshot?.previous?.find((service) => service.id === update.service.id);

	if (previousService === undefined) {
		return;
	}

	const reverse = reverseOf(update, previousService);

	if (reverse === null) {
		return;
	}

	queryClient.setQueryData<readonly Service[]>(SERVICES_KEY, (current) => (current === undefined ? current : withServiceUpdate(current, reverse)));
}

function reverseOf(update: ServiceUpdate, previousService: Service): ServiceUpdate | null {
	if (update.kind === 'strategy') {
		return { ...update, strategy: previousService.lbStrategy };
	}

	const previousInstance = previousService.instances.find((instance) => instance.id === update.instance.id);

	if (previousInstance === undefined) {
		return null;
	}

	if (update.kind === 'weight') {
		return { ...update, weight: previousInstance.weight };
	}

	if (update.kind === 'enabled') {
		return { ...update, isEnabled: previousInstance.isEnabled };
	}

	return assertUnreachable(update);
}
