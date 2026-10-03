import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError } from '../api/adminApiClient';
import { hasErrors, type FieldErrors } from '../lib/formValidation';

const HTTP_CONFLICT = 409;

export type EntityFormOptions<Values, Result> = {
	readonly initial: Values;
	// Error i18n keys per field.
	readonly validate: (values: Values) => FieldErrors<keyof Values & string>;
	readonly save: (values: Values) => Promise<Result>;
	// Where a 409 from the server belongs (a slug or a prefix in use), and
	// what it says there.
	readonly conflict: { readonly field: keyof Values & string; readonly messageKey: string } | null;
};

export type EntityForm<Values, Result> = {
	readonly values: Values;
	readonly setField: <Field extends keyof Values>(field: Field, value: Values[Field]) => void;
	// Field errors, shown once the operator tried to save.
	readonly errors: FieldErrors<keyof Values & string>;
	// A failure that belongs to no single field.
	readonly formError: string | null;
	readonly isSubmitting: boolean;
	// The saved result, or null when invalid or refused.
	readonly submit: () => Promise<Result | null>;
};

// Validation shows after the first attempt; a 409 lands on its field, anything else in the
// footer.
export function useEntityForm<Values extends object, Result>(options: EntityFormOptions<Values, Result>): EntityForm<Values, Result> {
	const { t } = useTranslation();
	const { validate, save, conflict } = options;
	const [values, setValues] = useState(options.initial);
	const [hasTriedSubmit, setHasTriedSubmit] = useState(false);
	const [serverErrors, setServerErrors] = useState<FieldErrors<keyof Values & string>>({});
	const [formError, setFormError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const setField = useCallback(<Field extends keyof Values>(field: Field, value: Values[Field]) => {
		setValues((current) => ({ ...current, [field]: value }));
		setServerErrors((current) => ({ ...current, [field]: undefined }));
	}, []);

	const fieldErrors = hasTriedSubmit ? validate(values) : {};
	const errors = { ...fieldErrors, ...Object.fromEntries(Object.entries(serverErrors).filter(([, error]) => error !== undefined)) };

	async function submit(): Promise<Result | null> {
		setHasTriedSubmit(true);
		setFormError(null);

		if (hasErrors(validate(values))) {
			return null;
		}

		setIsSubmitting(true);

		try {
			return await save(values);
		} catch (error) {
			const isConflict = error instanceof AdminApiError && error.statusCode === HTTP_CONFLICT && conflict !== null;

			if (isConflict) {
				setServerErrors({ [conflict.field]: conflict.messageKey } as FieldErrors<keyof Values & string>);
			} else {
				setFormError(error instanceof AdminApiError ? error.message : t('common.unexpectedError'));
			}

			return null;
		} finally {
			setIsSubmitting(false);
		}
	}

	return { values, setField, errors, formError, isSubmitting, submit };
}
