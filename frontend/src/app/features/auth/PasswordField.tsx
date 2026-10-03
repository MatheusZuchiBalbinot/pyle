import { Eye, EyeOff } from 'lucide-react';
import { useId, useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

export type PasswordFieldProps = {
	readonly value: string;
	readonly onChange: (event: ChangeEvent<HTMLInputElement>) => void;
};

export function PasswordField({ value, onChange }: PasswordFieldProps): ReactElement {
	const { t } = useTranslation();
	const inputId = useId();
	const [isRevealed, setIsRevealed] = useState(false);
	const toggleLabel = isRevealed ? t('login.hidePassword') : t('login.showPassword');
	const ToggleIcon = isRevealed ? EyeOff : Eye;

	function handleToggleClick(): void {
		setIsRevealed((current) => !current);
	}

	return (
		<div className="login-field">
			<label className="login-field-label" htmlFor={inputId}>
				{t('login.password')}
			</label>
			<div className="login-field-control">
				<input
					id={inputId}
					type={isRevealed ? 'text' : 'password'}
					value={value}
					onChange={onChange}
					placeholder={t('login.passwordPlaceholder')}
					autoComplete="current-password"
					required
				/>
				<button
					type="button"
					className="login-password-toggle"
					onClick={handleToggleClick}
					aria-label={toggleLabel}
					aria-pressed={isRevealed}
					data-tooltip={toggleLabel}
				>
					<ToggleIcon size={16} aria-hidden="true" />
				</button>
			</div>
		</div>
	);
}
