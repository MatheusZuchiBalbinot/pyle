import type { AdminAccountInput } from '../auth/application/ensure-admin-account.js';
import { MIN_PASSWORD_LENGTH } from '../auth/interface/dto/admin-auth.dto.js';

const DEFAULT_DEV_ADMIN_NAME = 'Dev Admin';

// Refused in production: a password everyone can read in .env.example is only fine on a
// developer's machine.
export function readDevAdminAccount(env: NodeJS.ProcessEnv): AdminAccountInput {
	if (env.NODE_ENV === 'production') {
		throw new Error('Refusing to seed the dev admin account with NODE_ENV=production');
	}

	const email = env.DEV_ADMIN_EMAIL;
	const password = env.DEV_ADMIN_PASSWORD;
	const hasCredentials = email !== undefined && email !== '' && password !== undefined && password !== '';

	if (!hasCredentials) {
		throw new Error('DEV_ADMIN_EMAIL and DEV_ADMIN_PASSWORD must be set (see backend/.env.example)');
	}

	if (password.length < MIN_PASSWORD_LENGTH) {
		throw new Error(`DEV_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
	}

	return { email, password, name: env.DEV_ADMIN_NAME ?? DEFAULT_DEV_ADMIN_NAME };
}
