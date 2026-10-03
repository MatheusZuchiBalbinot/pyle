import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { RealtimeEvent } from '@/app/api/realtimeEvents';
import type { ToastTone } from '@/app/core/gateway/gatewayContext';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useRealtimeEvents } from '@/app/core/realtime/useRealtime';

import { toRealtimeEventCopy, type RealtimeEventTone } from '../lib/realtimeEventCopy';

const TOAST_TONE_BY_EVENT_TONE: Readonly<Record<RealtimeEventTone, ToastTone>> = {
	info: 'info',
	success: 'success',
	warning: 'warning',
	danger: 'danger',
};

// Toasts only the facts worth interrupting for; pages refetch on their own.
export function useRealtimeReactions(): void {
	const { t } = useTranslation();
	const { toast } = useGateway();

	const handleEvent = useCallback(
		(event: RealtimeEvent) => {
			const copy = toRealtimeEventCopy(event, t);

			if (copy.isProminent) {
				toast(copy.title, TOAST_TONE_BY_EVENT_TONE[copy.tone]);
			}
		},
		[toast, t],
	);

	useRealtimeEvents(handleEvent);
}
