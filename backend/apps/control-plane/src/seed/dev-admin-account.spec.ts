import { describe, expect, it } from 'vitest';

import { readDevAdminAccount } from './dev-admin-account.js';

const VALID_ENV: NodeJS.ProcessEnv = { DEV_ADMIN_EMAIL: 'admin@pyle.local', DEV_ADMIN_PASSWORD: 'pyle-admin-dev' };

describe('readDevAdminAccount', () => {
	it('reads the account from the environment, with a default name', () => {
		expect(readDevAdminAccount(VALID_ENV)).toEqual({ email: 'admin@pyle.local', password: 'pyle-admin-dev', name: 'Dev Admin' });
	});

	it('uses DEV_ADMIN_NAME when given', () => {
		expect(readDevAdminAccount({ ...VALID_ENV, DEV_ADMIN_NAME: 'Ops' }).name).toBe('Ops');
	});

	it('refuses to run in production, whatever the credentials', () => {
		expect(() => readDevAdminAccount({ ...VALID_ENV, NODE_ENV: 'production' })).toThrow('NODE_ENV=production');
	});

	it.each([
		['the email is missing', { DEV_ADMIN_PASSWORD: 'pyle-admin-dev' }],
		['the password is missing', { DEV_ADMIN_EMAIL: 'admin@pyle.local' }],
		['the email is empty', { ...VALID_ENV, DEV_ADMIN_EMAIL: '' }],
	])('asks for both variables when %s', (_case, env: NodeJS.ProcessEnv) => {
		expect(() => readDevAdminAccount(env)).toThrow('DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD must be set');
	});

	it('rejects a password the login form itself would refuse', () => {
		expect(() => readDevAdminAccount({ ...VALID_ENV, DEV_ADMIN_PASSWORD: 'short' })).toThrow('at least 12 characters');
	});
});
