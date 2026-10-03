import type { ReactElement, ReactNode } from 'react';

import './FormField.css';

export type FormFieldProps = {
	readonly label: string;
	readonly hint?: string;
	readonly error?: string;
	readonly children: ReactNode;
};

// For controls that are not a plain text input.
export function FormField({ label, hint, error, children }: FormFieldProps): ReactElement {
	return (
		<div className={`form-field ${error ? 'has-error' : ''}`.trim()}>
			<span className="field-label">{label}</span>
			{children}
			{error ? (
				<span className="form-field-error" role="alert">
					{error}
				</span>
			) : (
				hint && <span className="form-field-hint">{hint}</span>
			)}
		</div>
	);
}
