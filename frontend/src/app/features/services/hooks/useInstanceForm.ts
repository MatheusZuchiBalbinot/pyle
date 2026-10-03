import { createInstance } from '@/app/api/adminApiClient';
import type { ServiceInstance } from '@/app/api/adminApiTypes';
import { stampLocalEvent } from '@/app/api/realtimeEvents';
import { useEmitLocalEvent } from '@/app/core/realtime/useRealtime';
import { useEntityForm, type EntityForm } from '@/app/hooks/useEntityForm';

import { EMPTY_INSTANCE_FORM, toInstanceInput, validateInstanceForm, type InstanceFormValues } from '../lib/instanceFormValidation';

const NAME_CONFLICT = { field: 'name', messageKey: 'services.instanceForm.errors.nameTaken' } as const;

export function useInstanceForm(serviceSlug: string): EntityForm<InstanceFormValues, ServiceInstance> {
	const emitLocalEvent = useEmitLocalEvent();

	async function save(values: InstanceFormValues): Promise<ServiceInstance> {
		const created = await createInstance(serviceSlug, toInstanceInput(values));

		emitLocalEvent(stampLocalEvent({ type: 'entity.changed', entity: 'ServiceInstance', action: 'created', id: created.id }));

		return created;
	}

	return useEntityForm({ initial: EMPTY_INSTANCE_FORM, validate: validateInstanceForm, save, conflict: NAME_CONFLICT });
}
