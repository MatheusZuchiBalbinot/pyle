import { useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { LoadBalancingStrategy, Service } from '@/app/api/adminApiTypes';
import { useServiceForm, type ServiceFormMode } from '@/app/features/services/hooks/useServiceForm';
import type { ServiceFormState } from '@/app/features/services/lib/serviceFormValidation';
import { STRATEGY_LABEL_KEY } from '@/app/lib/gatewayLabels';
import { Button } from '@/app/ui/Button/Button';
import { FormDialog } from '@/app/ui/FormDialog/FormDialog';
import { FormField } from '@/app/ui/FormField/FormField';
import { SelectInput } from '@/app/ui/SelectInput/SelectInput';
import { TextInput } from '@/app/ui/TextInput/TextInput';

type TextField = Exclude<keyof ServiceFormState, 'lbStrategy'>;

const STRATEGIES: readonly LoadBalancingStrategy[] = ['round_robin', 'least_connections', 'weighted_random'];

const ADVANCED_FIELDS: readonly TextField[] = [
	'healthCheckPath',
	'healthCheckIntervalMs',
	'healthCheckTimeoutMs',
	'healthyThreshold',
	'unhealthyThreshold',
	'circuitFailureThreshold',
	'circuitCooldownMs',
];

export type ServiceFormProps = { readonly mode: ServiceFormMode; readonly onSaved: (service: Service) => void; readonly onCancel: () => void };

export function ServiceForm({ mode, onSaved, onCancel }: ServiceFormProps): ReactElement {
	const { t } = useTranslation();
	const { values, setField, errors, formError, isSubmitting, submit } = useServiceForm(mode);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const isEditing = mode.kind === 'edit';
	const strategyOptions = STRATEGIES.map((strategy) => ({ value: strategy, label: t(STRATEGY_LABEL_KEY[strategy]) }));

	async function handleSubmit(): Promise<void> {
		const saved = await submit();

		if (saved) {
			onSaved(saved);
		}
	}

	function handleStrategy(strategy: LoadBalancingStrategy): void {
		setField('lbStrategy', strategy);
	}

	function renderField(field: TextField, extra: { readonly isNumeric?: boolean; readonly isDisabled?: boolean } = {}): ReactElement {
		const label = t(`services.form.fields.${field}`);
		const error = errors[field];

		return (
			<FormField key={field} label={label} hint={t(`services.form.hints.${field}`)} error={error === undefined ? undefined : t(error)}>
				<TextInput
					label={label}
					value={values[field]}
					inputMode={extra.isNumeric ? 'numeric' : undefined}
					disabled={extra.isDisabled}
					onChange={(event: ChangeEvent<HTMLInputElement>) => setField(field, event.target.value)}
				/>
			</FormField>
		);
	}

	return (
		<FormDialog
			title={isEditing ? t('services.form.editTitle') : t('services.form.createTitle')}
			submitLabel={isEditing ? t('common.save') : t('services.form.create')}
			submitTooltip={t('services.form.submitTooltip')}
			isSubmitting={isSubmitting}
			errorMessage={formError}
			onSubmit={() => void handleSubmit()}
			onCancel={onCancel}
		>
			<div className="form-grid">
				{renderField('name')}
				{renderField('slug', { isDisabled: isEditing })}
				<div className="is-wide">{renderField('description')}</div>
				<FormField label={t('services.form.fields.lbStrategy')} hint={t('services.form.hints.lbStrategy')}>
					<SelectInput label={t('services.form.fields.lbStrategy')} options={strategyOptions} value={values.lbStrategy} onChange={handleStrategy} />
				</FormField>
				{renderField('timeoutMs', { isNumeric: true })}
				{renderField('retryMaxAttempts', { isNumeric: true })}
				<div className="is-wide">
					<Button
						type="button"
						variant="pill"
						isSmall
						isActive={isAdvancedOpen}
						onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
						data-tooltip={t('services.form.advancedTooltip')}
					>
						{t('services.form.advanced')}
					</Button>
				</div>
				{isAdvancedOpen && ADVANCED_FIELDS.map((field) => renderField(field, { isNumeric: field !== 'healthCheckPath' }))}
			</div>
		</FormDialog>
	);
}
