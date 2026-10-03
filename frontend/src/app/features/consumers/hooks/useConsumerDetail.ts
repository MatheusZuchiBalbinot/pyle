import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, deleteConsumer, getConsumerTraffic, issueApiKey } from '@/app/api/adminApiClient';
import type { ApiKey, ApiKeyCreated, Consumer, ConsumerTraffic, TrafficWindowName } from '@/app/api/adminApiTypes';
import { stampLocalEvent, type BroadcastEntity } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useLiveTraffic } from '@/app/features/traffic/hooks/useLiveTraffic';
import { useTrafficWindow } from '@/app/features/traffic/hooks/useTrafficWindow';
import type { AsyncResourceState } from '@/app/hooks/useAsyncResource';

import { useApiKeyRevocation } from './useApiKeyRevocation';
import { useConsumerRoutesUpdate } from './useConsumerRoutesUpdate';

// Removing the consumer, waiting for its typed confirmation. A key revocation needs none: it
// is undone from its toast (useApiKeyRevocation).
export type PendingConsumerDeletion = { readonly isRunning: boolean; readonly errorMessage: string | null };

export type ConsumerDetailState = {
	readonly window: TrafficWindowName;
	readonly setWindow: (value: TrafficWindowName) => void;
	readonly traffic: AsyncResourceState<ConsumerTraffic>;
	// The new key in clear, or null when it failed (a toast says why).
	readonly issueKey: (label: string) => Promise<ApiKeyCreated | null>;
	// Optimistic: the consumer shows the new routes at once (useConsumerRoutesUpdate).
	readonly setRoutes: (routeIds: readonly string[]) => Promise<boolean>;
	readonly pending: PendingConsumerDeletion | null;
	readonly revokeKey: (key: ApiKey) => Promise<void>;
	readonly requestDelete: () => void;
	readonly cancelPending: () => void;
	readonly confirmPending: () => Promise<void>;
};

export function useConsumerDetail(consumer: Consumer): ConsumerDetailState {
	const { t } = useTranslation();
	const { toast } = useGateway();
	const emitLocalEvent = useEmitLocalEvent();
	const { window, setWindow } = useTrafficWindow('consumers', '1h');
	const load = useCallback(() => getConsumerTraffic(consumer.slug, { window }), [consumer.slug, window]);
	const traffic = useLiveTraffic(load, {
		queryKey: queryKeys.consumerTraffic(consumer.slug, window),
		fallbackErrorMessage: t('consumers.detail.trafficError'),
	}).loadState;
	const [pending, setPending] = useState<PendingConsumerDeletion | null>(null);
	const { saveRoutes } = useConsumerRoutesUpdate(consumer);
	const { revoke } = useApiKeyRevocation(consumer);

	function announce(entity: BroadcastEntity, id: string, action: 'created' | 'updated' | 'deleted'): void {
		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity, action, id }));
	}

	function messageOf(error: unknown): string {
		return error instanceof AdminApiError ? error.message : t('common.unexpectedError');
	}

	async function issueKey(label: string): Promise<ApiKeyCreated | null> {
		try {
			const created = await issueApiKey(consumer.slug, label.trim() === '' ? {} : { label: label.trim() });

			announce('ApiKey', created.id, 'created');

			return created;
		} catch (error) {
			toast(messageOf(error), 'danger');

			return null;
		}
	}

	async function confirmPending(): Promise<void> {
		if (pending === null) {
			return;
		}

		setPending({ isRunning: true, errorMessage: null });

		try {
			await deleteConsumer(consumer.slug);
			announce('Consumer', consumer.id, 'deleted');
			setPending(null);
		} catch (error) {
			setPending({ isRunning: false, errorMessage: messageOf(error) });
		}
	}

	return {
		window,
		setWindow,
		traffic,
		issueKey,
		setRoutes: saveRoutes,
		pending,
		revokeKey: revoke,
		requestDelete: () => setPending({ isRunning: false, errorMessage: null }),
		cancelPending: () => setPending(null),
		confirmPending,
	};
}
