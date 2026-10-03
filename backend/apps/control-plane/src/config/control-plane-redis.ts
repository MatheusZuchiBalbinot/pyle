import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

export function getControlPlaneRedisUrl(): string {
	return readRequiredEnv('CONTROL_PLANE_REDIS_URL');
}
