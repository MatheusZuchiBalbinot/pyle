import { CircleAlert, Clock, LogIn } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { AuthError } from '@/app/api/authSession';
import { useAuth } from '@/app/core/auth/useAuth';
import { Button } from '@/app/ui/Button/Button';
import { PyleLogo } from '@/app/ui/PyleLogo/PyleLogo';

import { EmailField } from './EmailField';
import { LoginBrandPanel } from './LoginBrandPanel';
import { PasswordField } from './PasswordField';

import './LoginPage.css';

const TOO_MANY_REQUESTS = 429;
const UNAUTHORIZED = 401;

type SubmitState = { readonly phase: 'idle' } | { readonly phase: 'submitting' } | { readonly phase: 'error'; readonly message: string };

// Never says which part of the credentials was wrong (the API does not either).
export function LoginPage(): ReactElement {
	const { t } = useTranslation();
	const { signIn, state } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [submitState, setSubmitState] = useState<SubmitState>({ phase: 'idle' });
	const isSubmitting = submitState.phase === 'submitting';

	function resolveErrorMessage(error: unknown): string {
		if (!(error instanceof AuthError)) {
			return t('login.networkError');
		}

		if (error.statusCode === TOO_MANY_REQUESTS) {
			return t('login.tooManyAttempts');
		}

		if (error.statusCode === UNAUTHORIZED) {
			return t('login.invalidCredentials');
		}

		return error.message;
	}

	async function submit(): Promise<void> {
		setSubmitState({ phase: 'submitting' });

		try {
			await signIn(email, password);
		} catch (error) {
			setPassword('');
			setSubmitState({ phase: 'error', message: resolveErrorMessage(error) });
		}
	}

	function handleEmailChange(event: ChangeEvent<HTMLInputElement>): void {
		setEmail(event.target.value);
	}

	function handlePasswordChange(event: ChangeEvent<HTMLInputElement>): void {
		setPassword(event.target.value);
	}

	function handleSubmit(event: FormEvent): void {
		event.preventDefault();
		void submit();
	}

	const hasExpiredNotice = state.status === 'signed-out' && state.reason === 'expired' && submitState.phase !== 'error';

	return (
		<main className="login-page">
			<div className="login-shell">
				<LoginBrandPanel />

				<form className="login-card" onSubmit={handleSubmit} aria-labelledby="login-title">
					<header className="login-card-header">
						<PyleLogo className="login-card-logo" size={36} />
						<h1 id="login-title">{t('login.title')}</h1>
						<p>{t('login.subtitle')}</p>
					</header>

					<EmailField value={email} onChange={handleEmailChange} />
					<PasswordField value={password} onChange={handlePasswordChange} />

					{submitState.phase === 'error' && (
						<p className="login-message is-error" role="alert">
							<CircleAlert size={15} aria-hidden="true" />
							{submitState.message}
						</p>
					)}
					{hasExpiredNotice && (
						<p className="login-message is-notice" role="status">
							<Clock size={15} aria-hidden="true" />
							{t('login.sessionExpired')}
						</p>
					)}

					<Button type="submit" variant="primary" className="login-submit" disabled={isSubmitting} data-tooltip={t('login.submitTooltip')}>
						<LogIn size={16} aria-hidden="true" />
						{isSubmitting ? t('login.submitting') : t('login.submit')}
					</Button>

					<p className="login-footnote">{t('login.noAccess')}</p>
				</form>
			</div>
		</main>
	);
}
