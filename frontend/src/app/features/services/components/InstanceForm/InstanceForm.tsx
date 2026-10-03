import type { ChangeEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { useInstanceForm } from '@/app/features/services/hooks/useInstanceForm';
import type { InstanceFormValues } from '@/app/features/services/lib/instanceFormValidation';
import { FormDialog } from '@/app/ui/FormDialog/FormDialog';
import { FormField } from '@/app/ui/FormField/FormField';
import { TextInput } from '@/app/ui/TextInput/TextInput';

export type InstanceFormProps = { readonly service: Service; readonly onSaved: (instance: ServiceInstance) => void; readonly onCancel: () => void };

export function InstanceForm({ service, onSaved, onCancel }: InstanceFormProps): ReactElement {
	const { t } = useTranslation();
	const { values, setField, errors, formError, isSubmitting, submit } = useInstanceForm(service.slug);

	async function handleSubmit(): Promise<void> {
		const saved = await submit();

		if (saved) {
			onSaved(saved);
		}
	}

	function renderField(field: keyof InstanceFormValues): ReactElement {
		const label = t(`services.instanceForm.${field}`);
		const error = errors[field];

		return (
			<FormField label={label} hint={t(`services.instanceForm.${field}Hint`)} error={error === undefined ? undefined : t(error)}>
				<TextInput
					label={label}
					className={field === 'url' ? 'mono' : undefined}
					value={values[field]}
					onChange={(event: ChangeEvent<HTMLInputElement>) => setField(field, event.target.value)}
				/>
			</FormField>
		);
	}

	return (
		<FormDialog
			title={t('services.instanceForm.title', { service: service.name })}
			submitLabel={t('services.instanceForm.create')}
			submitTooltip={t('services.instanceForm.createTooltip')}
			isSubmitting={isSubmitting}
			errorMessage={formError}
			onSubmit={() => void handleSubmit()}
			onCancel={onCancel}
		>
			{renderField('name')}
			{renderField('url')}
			{renderField('weight')}
		</FormDialog>
	);
}
