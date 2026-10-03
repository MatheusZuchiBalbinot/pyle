import type { ChangeEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Route } from '@/app/api/adminApiTypes';
import { useConsumerForm, type ConsumerFormMode, type ConsumerSaved } from '@/app/features/consumers/hooks/useConsumerForm';
import type { ConsumerFormValues } from '@/app/features/consumers/lib/consumerFormValidation';
import { FormDialog } from '@/app/ui/FormDialog/FormDialog';
import { FormField } from '@/app/ui/FormField/FormField';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import { ConsumerRoutesPicker } from '../ConsumerRoutesPicker/ConsumerRoutesPicker';

export type ConsumerFormProps = {
	readonly mode: ConsumerFormMode;
	readonly routes: readonly Route[];
	readonly onSaved: (saved: ConsumerSaved) => void;
	readonly onCancel: () => void;
};

type TextField = Exclude<keyof ConsumerFormValues, 'routeIds'>;

export function ConsumerForm({ mode, routes, onSaved, onCancel }: ConsumerFormProps): ReactElement {
	const { t } = useTranslation();
	const { values, setField, errors, formError, isSubmitting, submit } = useConsumerForm(mode);
	const isEditing = mode.kind === 'edit';

	async function handleSubmit(): Promise<void> {
		const saved = await submit();

		if (saved) {
			onSaved(saved);
		}
	}

	function renderField(field: TextField, isDisabled = false): ReactElement {
		const label = t(`consumers.form.${field}`);
		const error = errors[field];

		return (
			<FormField label={label} hint={t(`consumers.form.${field}Hint`)} error={error === undefined ? undefined : t(error)}>
				<TextInput
					label={label}
					value={values[field]}
					disabled={isDisabled}
					onChange={(event: ChangeEvent<HTMLInputElement>) => setField(field, event.target.value)}
				/>
			</FormField>
		);
	}

	return (
		<FormDialog
			title={isEditing ? t('consumers.form.editTitle') : t('consumers.form.createTitle')}
			description={isEditing ? undefined : t('consumers.form.createDesc')}
			submitLabel={isEditing ? t('common.save') : t('consumers.form.create')}
			submitTooltip={isEditing ? t('consumers.form.saveTooltip') : t('consumers.form.createTooltip')}
			isSubmitting={isSubmitting}
			errorMessage={formError}
			onSubmit={() => void handleSubmit()}
			onCancel={onCancel}
		>
			<div className="form-grid">
				{renderField('name')}
				{renderField('slug', isEditing)}
				{renderField('rateLimitPerMinute')}
			</div>
			{!isEditing && (
				<FormField label={t('consumers.form.routes')}>
					<ConsumerRoutesPicker routes={routes} value={values.routeIds} onChange={(routeIds) => setField('routeIds', routeIds)} />
				</FormField>
			)}
		</FormDialog>
	);
}
