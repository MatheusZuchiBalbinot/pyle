import { createConsumer, updateConsumer } from '@/app/api/adminApiClient';
import type { Consumer, ConsumerCreated } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useEntityForm, type EntityForm } from '@/app/hooks/useEntityForm';

import { consumerToFormValues, EMPTY_CONSUMER_FORM, validateConsumerForm, type ConsumerFormValues } from '../lib/consumerFormValidation';

export type ConsumerFormMode = { readonly kind: 'create' } | { readonly kind: 'edit'; readonly consumer: Consumer };

// A creation comes back with the first key in clear, to show once.
export type ConsumerSaved =
	{ readonly kind: 'created'; readonly consumer: ConsumerCreated } | { readonly kind: 'updated'; readonly consumer: Consumer };

const SLUG_CONFLICT = { field: 'slug', messageKey: 'consumers.form.errors.slugTaken' } as const;

export function useConsumerForm(mode: ConsumerFormMode): EntityForm<ConsumerFormValues, ConsumerSaved> {
	const emitLocalEvent = useEmitLocalEvent();

	async function save(values: ConsumerFormValues): Promise<ConsumerSaved> {
		const saved = await persistConsumer(mode, values);

		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Consumer', action: saved.kind, id: saved.consumer.id }));

		return saved;
	}

	const initial = mode.kind === 'create' ? EMPTY_CONSUMER_FORM : consumerToFormValues(mode.consumer);

	return useEntityForm({ initial, validate: validateConsumerForm, save, conflict: SLUG_CONFLICT });
}

async function persistConsumer(mode: ConsumerFormMode, values: ConsumerFormValues): Promise<ConsumerSaved> {
	const rateLimitPerMinute = Number(values.rateLimitPerMinute);

	if (mode.kind === 'create') {
		const consumer = await createConsumer({ slug: values.slug.trim(), name: values.name.trim(), rateLimitPerMinute, routeIds: values.routeIds });

		return { kind: 'created', consumer };
	}

	const consumer = await updateConsumer(mode.consumer.slug, { name: values.name.trim(), rateLimitPerMinute });

	return { kind: 'updated', consumer };
}
