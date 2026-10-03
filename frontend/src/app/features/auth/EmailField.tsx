import { useId, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type EmailFieldProps = {
	readonly value: string;
	readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function EmailField({ value, onChange }: EmailFieldProps): ReactElement {
	const { t } = useTranslation();
	const inputId = useId();

	return (
		<div className="login-field">
			<label className="login-field-label" htmlFor={inputId}>
				{t('login.email')}
			</label>
			<div className="login-field-control">
				<input
					id={inputId}
					type="email"
					value={value}
					onChange={onChange}
					placeholder={t('login.emailPlaceholder')}
					autoComplete="username"
					required
					autoFocus
				/>
			</div>
		</div>
	);
}
