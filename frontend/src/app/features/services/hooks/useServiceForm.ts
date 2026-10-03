import { createService, updateService } from '@/app/api/adminApiClient';
import type { Service } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useEntityForm, type EntityForm } from '@/app/hooks/useEntityForm';
import { changedFields } from '@/app/lib/formValidation';

import { EMPTY_SERVICE_FORM, serviceToFormValues, toServiceInput, validateServiceForm, type ServiceFormState } from '../lib/serviceFormValidation';

export type ServiceFormMode = { readonly kind: 'create' } | { readonly kind: 'edit'; readonly service: Service };

const SLUG_CONFLICT = { field: 'slug', messageKey: 'services.form.errors.slugTaken' } as const;

export function useServiceForm(mode: ServiceFormMode): EntityForm<ServiceFormState, Service> {
	const emitLocalEvent = useEmitLocalEvent();

	async function save(values: ServiceFormState): Promise<Service> {
		const saved = await persistService(mode, values);
		const action = mode.kind === 'create' ? 'created' : 'updated';

		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'Service', action, id: saved.id }));

		return saved;
	}

	const initial = mode.kind === 'create' ? EMPTY_SERVICE_FORM : serviceToFormValues(mode.service);

	return useEntityForm({ initial, validate: validateServiceForm, save, conflict: SLUG_CONFLICT });
}

function persistService(mode: ServiceFormMode, values: ServiceFormState): Promise<Service> {
	const input = toServiceInput(values);

	if (mode.kind === 'create') {
		return createService(input);
	}

	const { slug: _slug, ...original } = toServiceInput(serviceToFormValues(mode.service));
	const { slug: _unchangedSlug, ...next } = input;

	return updateService(mode.service.slug, changedFields(original, next));
}
