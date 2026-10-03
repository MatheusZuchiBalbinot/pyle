import { useMutation, useQueryClient, type UseMutationOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

import { AdminApiError, restoreApiKey, revokeApiKey } from '@/app/api/adminApiClient';
import type { ApiKey, Consumer } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import type { ToastAction } from '@/app/core/gateway/gatewayContext';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';

import { CONSUMER_PAGES_KEY, invalidateConsumers, takeConsumersSnapshot, writeConsumer, type ConsumersSnapshot } from '../lib/consumerCache';

export type ApiKeyRevocation = {
	// Revoked at once, with "Desfazer" in the toast for the restore window.
	readonly revoke: (key: ApiKey) => Promise<void>;
};

type KeyChange = { readonly key: ApiKey; readonly revokedAt: string | null };

// No confirmation first: a revocation is undone from its toast instead, which the backend
// allows for a minute (POST .../keys/:id/restore). The key stops working at once either way.
export function useApiKeyRevocation(consumer: Consumer): ApiKeyRevocation {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const queryClient = useQueryClient();

	async function snapshotAndApply(change: KeyChange): Promise<ConsumersSnapshot> {
		const snapshot = await takeConsumersSnapshot(queryClient);
		const apiKeys = consumer.apiKeys.map((key) => (key.id === change.key.id ? { ...key, revokedAt: change.revokedAt } : key));

		writeConsumer(queryClient, snapshot, { ...consumer, apiKeys });

		return snapshot;
	}

	function sendChange(change: KeyChange): Promise<void> {
		if (change.revokedAt === null) {
			return restoreApiKey(consumer.slug, change.key.id);
		}

		return revokeApiKey(consumer.slug, change.key.id);
	}

	function handleSuccess(_result: void, change: KeyChange): void {
		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'ApiKey', action: 'updated', id: change.key.id }));
	}

	function handleError(error: Error, _change: KeyChange, snapshot: ConsumersSnapshot | undefined): void {
		if (snapshot !== undefined) {
			writeConsumer(queryClient, snapshot, consumer);
		}

		toast(error instanceof AdminApiError ? error.message : t('common.unexpectedError'), 'danger');
	}

	async function handleSettled(): Promise<void> {
		await invalidateConsumers(queryClient);
	}

	const mutationOptions: UseMutationOptions<void, Error, KeyChange, ConsumersSnapshot> = {
		// Realtime refetches of this list wait for the change to settle (useRealtimeRefetch).
		mutationKey: CONSUMER_PAGES_KEY,
		mutationFn: sendChange,
		onMutate: snapshotAndApply,
		onSuccess: handleSuccess,
		onError: handleError,
		onSettled: handleSettled,
	};
	const { mutateAsync } = useMutation(mutationOptions);

	async function applyChange(change: KeyChange): Promise<boolean> {
		try {
			await mutateAsync(change);

			return true;
		} catch {
			// handleError already put the key back and said why.
			return false;
		}
	}

	async function revoke(key: ApiKey): Promise<void> {
		const isRevoked = await applyChange({ key, revokedAt: new Date().toISOString() });

		if (!isRevoked) {
			return;
		}

		function undo(): void {
			void applyChange({ key, revokedAt: null });
		}

		const undoAction: ToastAction = { label: t('toasts.undo'), onAct: undo };

		toast(t('consumers.revoke.done', { prefix: key.keyPrefix }), 'default', undoAction);
	}

	return { revoke };
}
