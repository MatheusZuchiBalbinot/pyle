import type { ChangeEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Route, Service } from '@/app/api/adminApiTypes';
import { useRouteForm, type RouteFormMode } from '@/app/features/routes/hooks/useRouteForm';
import { describeRewrite } from '@/app/features/routes/lib/routeFormValidation';
import { FormDialog } from '@/app/ui/FormDialog/FormDialog';
import { FormField } from '@/app/ui/FormField/FormField';
import { SelectInput } from '@/app/ui/SelectInput/SelectInput';
import { SwitchField } from '@/app/ui/SwitchField/SwitchField';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import { RouteMethodsPicker } from '../RouteMethodsPicker/RouteMethodsPicker';

import './RouteForm.css';

export type RouteFormProps = {
	readonly mode: RouteFormMode;
	readonly services: readonly Service[];
	readonly onSaved: (route: Route) => void;
	readonly onCancel: () => void;
};

export function RouteForm({ mode, services, onSaved, onCancel }: RouteFormProps): ReactElement {
	const { t } = useTranslation();
	const { values, setField, errors, formError, isSubmitting, submit } = useRouteForm(mode);
	const service = services.find((candidate) => candidate.slug === values.serviceSlug);
	const rewrite = describeRewrite(values.pathPrefix, values.stripPrefix);
	const errorText = (key: string | undefined): string | undefined => (key === undefined ? undefined : t(key));
	const serviceOptions = [
		{ value: '', label: t('routes.form.pickService') },
		...services.map((candidate) => ({ value: candidate.slug, label: candidate.name })),
	];
	const isEditing = mode.kind === 'edit';

	async function handleSubmit(): Promise<void> {
		const saved = await submit();

		if (saved) {
			onSaved(saved);
		}
	}

	function handleText(field: 'name' | 'pathPrefix' | 'rateLimitPerMinute' | 'timeoutMs') {
		return (event: ChangeEvent<HTMLInputElement>): void => setField(field, event.target.value);
	}

	function handleService(serviceSlug: string): void {
		setField('serviceSlug', serviceSlug);
	}

	return (
		<FormDialog
			title={isEditing ? t('routes.form.editTitle') : t('routes.form.createTitle')}
			submitLabel={isEditing ? t('common.save') : t('routes.form.create')}
			submitTooltip={isEditing ? t('routes.form.saveTooltip') : t('routes.form.createTooltip')}
			isSubmitting={isSubmitting}
			errorMessage={formError}
			onSubmit={() => void handleSubmit()}
			onCancel={onCancel}
		>
			<div className="form-grid">
				<FormField label={t('routes.form.name')} error={errorText(errors.name)}>
					<TextInput
						label={t('routes.form.name')}
						value={values.name}
						onChange={handleText('name')}
						placeholder={t('routes.form.namePlaceholder')}
						autoFocus
					/>
				</FormField>
				<FormField label={t('routes.form.service')} error={errorText(errors.serviceSlug)}>
					<SelectInput label={t('routes.form.service')} options={serviceOptions} value={values.serviceSlug} onChange={handleService} />
				</FormField>
				<div className="is-wide">
					<FormField label={t('routes.form.prefix')} hint={t('routes.form.prefixHint')} error={errorText(errors.pathPrefix)}>
						<TextInput
							label={t('routes.form.prefix')}
							className="mono"
							value={values.pathPrefix}
							onChange={handleText('pathPrefix')}
							spellCheck={false}
							autoComplete="off"
						/>
					</FormField>
					<p className="route-form-preview">
						{t('routes.form.preview', { prefix: values.pathPrefix || '/', service: service?.name ?? t('routes.form.noService') })}
						<span className="mono route-form-rewrite">
							{rewrite.incoming} → {rewrite.forwarded}
						</span>
					</p>
				</div>
				<div className="route-form-switches is-wide">
					<SwitchField
						isOn={values.stripPrefix}
						label={t('routes.form.stripPrefix')}
						hint={t('routes.form.stripPrefixTooltip')}
						onToggle={() => setField('stripPrefix', !values.stripPrefix)}
					/>
					<SwitchField
						isOn={values.isAuthRequired}
						label={t('routes.form.auth')}
						hint={t('routes.form.authTooltip')}
						onToggle={() => setField('isAuthRequired', !values.isAuthRequired)}
					/>
				</div>
				<div className="is-wide">
					<FormField label={t('routes.form.methods')} hint={t('routes.form.methodsHint')}>
						<RouteMethodsPicker value={values.methods} onChange={(methods) => setField('methods', methods)} />
					</FormField>
				</div>
				<FormField label={t('routes.form.rateLimit')} hint={t('routes.form.rateLimitHint')} error={errorText(errors.rateLimitPerMinute)}>
					<TextInput
						label={t('routes.form.rateLimit')}
						inputMode="numeric"
						value={values.rateLimitPerMinute}
						onChange={handleText('rateLimitPerMinute')}
						placeholder={t('routes.form.noLimit')}
					/>
				</FormField>
				<FormField label={t('routes.form.timeout')} hint={t('routes.form.timeoutHint')} error={errorText(errors.timeoutMs)}>
					<TextInput
						label={t('routes.form.timeout')}
						inputMode="numeric"
						value={values.timeoutMs}
						onChange={handleText('timeoutMs')}
						placeholder={service ? t('routes.form.timeoutFromService', { ms: service.timeoutMs }) : ''}
					/>
				</FormField>
			</div>
		</FormDialog>
	);
}
