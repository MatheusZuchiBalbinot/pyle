import { resolve } from 'node:path';

import { backendPath } from '@pyle/shared/config/backend-root.js';
import { readBooleanEnv, readPositiveIntEnv } from '@pyle/shared/config/env-parsing.js';

// Off unless enabled: scaling needs the Docker socket, which is root on the host.
type ScalingConfig =
	| { readonly isAllowed: false }
	| {
			readonly isAllowed: true;
			// Absolute host path mounted into every managed container.
			readonly demoServiceSourceDir: string;
			// How a gateway reaches a managed container's published port.
			readonly instanceHost: string;
			readonly reconciliationIntervalMs: number;
			readonly chaosToken: string | null;
	  };

// The repository's infra/demo-service, next to backend/.
const DEFAULT_DEMO_SERVICE_SOURCE_DIR = backendPath('..', 'infra', 'demo-service');
const DEFAULT_INSTANCE_HOST = 'localhost';
const DEFAULT_RECONCILIATION_INTERVAL_MS = 30_000;

export function getScalingConfig(): ScalingConfig {
	const isAllowed = readBooleanEnv('SCALING_ALLOWED', false);

	if (!isAllowed) {
		return { isAllowed: false };
	}

	return {
		isAllowed: true,
		demoServiceSourceDir: resolve(process.env.DEMO_SERVICE_SOURCE_DIR || DEFAULT_DEMO_SERVICE_SOURCE_DIR),
		instanceHost: process.env.INSTANCE_CONTAINER_HOST || DEFAULT_INSTANCE_HOST,
		reconciliationIntervalMs: readPositiveIntEnv('INSTANCE_RECONCILIATION_INTERVAL_MS', DEFAULT_RECONCILIATION_INTERVAL_MS),
		chaosToken: process.env.DEMO_CHAOS_TOKEN || null,
	};
}
