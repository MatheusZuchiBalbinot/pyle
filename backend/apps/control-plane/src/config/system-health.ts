import { readPositiveIntEnv } from '@pyle/shared/config/env-parsing.js';

const DEFAULT_SYSTEM_HEALTH_CHECK_INTERVAL_MS = 10_000;

export function getSystemHealthCheckIntervalMs(): number {
	return readPositiveIntEnv('SYSTEM_HEALTH_CHECK_INTERVAL_MS', DEFAULT_SYSTEM_HEALTH_CHECK_INTERVAL_MS);
}
