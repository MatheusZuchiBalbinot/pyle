import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AuthError } from '@/app/api/authSession';
import { AuthContext, type AuthContextValue, type AuthState } from '@/app/core/auth/authContext';

import { LoginPage } from './LoginPage';

type SignIn = AuthContextValue['signIn'];

function renderLogin(signIn: SignIn, state: AuthState = { status: 'signed-out', reason: 'initial' }): void {
	const value: AuthContextValue = { state, signIn, signOut: vi.fn() };

	render(
		<AuthContext.Provider value={value}>
			<LoginPage />
		</AuthContext.Provider>,
	);
}

function fillAndSubmit(): void {
	fireEvent.change(screen.getByLabelText('login.email'), { target: { value: 'admin@pyle.local' } });
	fireEvent.change(screen.getByLabelText('login.password'), { target: { value: 'secret' } });
	fireEvent.submit(screen.getByRole('form'));
}

async function failWith(error: unknown): Promise<HTMLInputElement> {
	renderLogin(vi.fn().mockRejectedValue(error));
	await act(async () => fillAndSubmit());

	return screen.getByLabelText('login.password') as HTMLInputElement;
}

describe('LoginPage', () => {
	it('signs in with what was typed and says it is working meanwhile', async () => {
		let finish: () => void = () => undefined;
		const signIn = vi.fn<SignIn>(() => new Promise<void>((resolve) => (finish = resolve)));

		renderLogin(signIn);

		fillAndSubmit();

		expect(signIn).toHaveBeenCalledWith('admin@pyle.local', 'secret');
		expect((screen.getByRole('button', { name: 'login.submitting' }) as HTMLButtonElement).disabled).toBe(true);
		await act(async () => finish());
	});

	it('says the credentials are wrong without saying which, and clears the password', async () => {
		const password = await failWith(new AuthError('Unauthorized', 401));

		expect(screen.getByRole('alert').textContent).toBe('login.invalidCredentials');
		expect(password.value).toBe('');
	});

	it('tells a rate-limited operator to wait', async () => {
		await failWith(new AuthError('Too many', 429));

		expect(screen.getByRole('alert').textContent).toBe('login.tooManyAttempts');
	});

	it('shows the server message for other refusals', async () => {
		await failWith(new AuthError('Account disabled', 403));
		expect(screen.getByRole('alert').textContent).toBe('Account disabled');
	});

	it('falls back to a network message when the request never got an answer', async () => {
		await failWith(new TypeError('Failed to fetch'));

		expect(screen.getByRole('alert').textContent).toBe('login.networkError');
	});

	it('explains an expired session until a new attempt fails', async () => {
		renderLogin(vi.fn().mockRejectedValue(new AuthError('Unauthorized', 401)), { status: 'signed-out', reason: 'expired' });
		expect(screen.getByRole('status').textContent).toBe('login.sessionExpired');

		await act(async () => fillAndSubmit());

		expect(screen.queryByRole('status')).toBeNull();
	});
});
