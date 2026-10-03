import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

export function getAdminApiToken(): string {
	return readRequiredEnv('ADMIN_API_TOKEN');
}
