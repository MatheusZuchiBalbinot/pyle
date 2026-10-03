import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, deleteInstance, deleteService } from '@/app/api/adminApiClient';
import type { LoadBalancingStrategy, Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { stampLocalEvent, type BroadcastEntity } from '@/app/api/realtimeEvents';
import type { ToastAction } from '@/app/core/gateway/gatewayContext';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';

import { useOptimisticServiceUpdate } from './useOptimisticServiceUpdate';

const HTTP_CONFLICT = 409;

// Something to remove, waiting for its typed confirmation.
export type PendingRemoval =
	| {
			readonly kind: 'instance';
			readonly service: Service;
			readonly instance: ServiceInstance;
			readonly isRemoving: boolean;
			readonly errorMessage: string | null;
	  }
	| { readonly kind: 'service'; readonly service: Service; readonly isRemoving: boolean; readonly errorMessage: string | null };

export type ServiceActions = {
	readonly drain: (service: Service, instance: ServiceInstance) => Promise<void>;
	readonly enable: (service: Service, instance: ServiceInstance) => Promise<void>;
	readonly setWeight: (service: Service, instance: ServiceInstance, weight: number) => Promise<void>;
	readonly setStrategy: (service: Service, strategy: LoadBalancingStrategy) => Promise<void>;
	readonly removal: PendingRemoval | null;
	readonly requestRemoveInstance: (service: Service, instance: ServiceInstance) => void;
	readonly requestRemoveService: (service: Service) => void;
	readonly cancelRemoval: () => void;
	readonly confirmRemoval: () => Promise<void>;
};

// Strategy, weight and drain are optimistic (useOptimisticServiceUpdate): the control is the
// confirmation, so only drain/enable toasts, to offer an undo. Removals are announced locally,
// so the page refreshes before the backend's echo.
export function useServiceActions(): ServiceActions {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const { apply } = useOptimisticServiceUpdate();
	const [removal, setRemoval] = useState<PendingRemoval | null>(null);

	function announce(entity: BroadcastEntity, id: string): void {
		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity, action: 'deleted', id }));
	}

	async function setEnabled(service: Service, instance: ServiceInstance, isEnabled: boolean): Promise<void> {
		const outcome = await apply({ kind: 'enabled', service, instance, isEnabled });

		if (outcome.status === 'failed') {
			return;
		}

		function handleUndo(): void {
			void apply({ kind: 'enabled', service, instance, isEnabled: !isEnabled });
		}

		const messageKey = isEnabled ? 'services.actions.enabled' : 'services.actions.drained';
		const undoAction: ToastAction = { label: t('toasts.undo'), onAct: handleUndo };

		toast(t(messageKey, { instance: instance.name }), 'success', undoAction);

		if (outcome.warning === 'service-has-no-enabled-instance') {
			toast(t('services.actions.noEnabledWarning', { service: service.name }), 'warning');
		}
	}

	async function setWeight(service: Service, instance: ServiceInstance, weight: number): Promise<void> {
		await apply({ kind: 'weight', service, instance, weight });
	}

	async function setStrategy(service: Service, strategy: LoadBalancingStrategy): Promise<void> {
		await apply({ kind: 'strategy', service, strategy });
	}

	async function performRemoval(pending: PendingRemoval): Promise<void> {
		if (pending.kind === 'instance') {
			await deleteInstance(pending.service.slug, pending.instance.id);
			announce('ServiceInstance', pending.instance.id);

			return;
		}

		await deleteService(pending.service.slug);
		announce('Service', pending.service.id);
	}

	function removalErrorMessage(pending: PendingRemoval, error: unknown): string {
		const isRoutesStillPointing = pending.kind === 'service' && error instanceof AdminApiError && error.statusCode === HTTP_CONFLICT;

		if (isRoutesStillPointing) {
			return t('services.remove.hasRoutes');
		}

		return error instanceof AdminApiError ? error.message : t('common.unexpectedError');
	}

	async function confirmRemoval(): Promise<void> {
		if (removal === null) {
			return;
		}

		setRemoval({ ...removal, isRemoving: true, errorMessage: null });

		try {
			await performRemoval(removal);
			setRemoval(null);
		} catch (error) {
			setRemoval({ ...removal, isRemoving: false, errorMessage: removalErrorMessage(removal, error) });
		}
	}

	return {
		drain: (service, instance) => setEnabled(service, instance, false),
		enable: (service, instance) => setEnabled(service, instance, true),
		setWeight,
		setStrategy,
		removal,
		requestRemoveInstance: (service, instance) => setRemoval({ kind: 'instance', service, instance, isRemoving: false, errorMessage: null }),
		requestRemoveService: (service) => setRemoval({ kind: 'service', service, isRemoving: false, errorMessage: null }),
		cancelRemoval: () => setRemoval(null),
		confirmRemoval,
	};
}
