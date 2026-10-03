import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import { getAdminApiToken } from './admin-api-token.js';
import { getAdminJwtSecret } from './admin-auth.js';
import { getChaosConfig } from './chaos.js';
import { getControlPlaneRedisUrl } from './control-plane-redis.js';
import { getRealtimeConfig } from './realtime.js';
import { getScalingConfig } from './scaling.js';
import { getAlertEvaluationIntervalMs, getConsumerPurgeAfterDays, getTrafficRetentionHours } from './traffic.js';

type ConfigCheck = {
	readonly name: string;
	readonly read: () => unknown;
};

// Required settings, checked at boot so a missing one fails loudly instead of deep in a
// request.
const REQUIRED_CONFIG_CHECKS: readonly ConfigCheck[] = [
	{ name: 'ADMIN_JWT_SECRET', read: getAdminJwtSecret },
	{ name: 'ADMIN_API_TOKEN', read: getAdminApiToken },
	{ name: 'CONTROL_PLANE_REDIS_URL', read: getControlPlaneRedisUrl },
	{ name: 'CENTRIFUGO_* (realtime)', read: getRealtimeConfig },
	{ name: 'TRAFFIC_RETENTION_HOURS', read: getTrafficRetentionHours },
	{ name: 'CONSUMER_PURGE_AFTER_DAYS', read: getConsumerPurgeAfterDays },
	{ name: 'ALERT_EVALUATION_INTERVAL_MS', read: getAlertEvaluationIntervalMs },
	{ name: 'CHAOS_ALLOWED / DEMO_CHAOS_TOKEN', read: getChaosConfig },
	{ name: 'SCALING_ALLOWED / INSTANCE_RECONCILIATION_INTERVAL_MS', read: getScalingConfig },
];

// Public values from .env.example: harmless in dev, refused in production.
const EXAMPLE_SECRET_VALUES: Readonly<Record<string, string>> = {
	ADMIN_API_TOKEN: 'dev-admin-token-change-me',
	ADMIN_JWT_SECRET: 'dev-admin-jwt-secret-change-me-0123456789',
	DEMO_CHAOS_TOKEN: 'dev-demo-chaos-token-change-me',
	CENTRIFUGO_API_KEY: 'dev-centrifugo-api-key-change-me',
	CENTRIFUGO_TOKEN_HMAC_SECRET: 'dev-centrifugo-hmac-secret-change-me',
};

// Names every problem at once, not one restart per variable.
export function validateStartupConfig(): void {
	const failures = [...REQUIRED_CONFIG_CHECKS.flatMap((check) => collectFailure(check)), ...collectExampleSecretFailures()];

	if (failures.length === 0) {
		return;
	}

	throw new Error(`Invalid configuration — the app cannot start:\n${failures.join('\n')}`);
}

function collectExampleSecretFailures(): readonly string[] {
	if (process.env.NODE_ENV !== 'production') {
		return [];
	}

	return Object.entries(EXAMPLE_SECRET_VALUES)
		.filter(([name, exampleValue]) => process.env[name] === exampleValue)
		.map(([name]) => `  - ${name}: still the value from .env.example — generate a real one for production`);
}

function collectFailure(check: ConfigCheck): readonly string[] {
	try {
		check.read();

		return [];
	} catch (error) {
		return [`  - ${check.name}: ${toErrorMessage(error)}`];
	}
}
