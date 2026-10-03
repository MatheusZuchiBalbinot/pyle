import { backendPath } from '@pyle/shared/config/backend-root.js';
import { readRequiredEnv } from '@pyle/shared/config/env-parsing.js';

import { MANIFEST_FILE_NAME } from './consumer-keys-manifest.js';

const DEFAULT_CONTROL_PLANE_URL = 'http://localhost:3000';
const DEFAULT_INSTANCE_HOST = 'localhost';

export type SeedConfig = {
	readonly controlPlaneUrl: string;
	readonly adminApiToken: string;
	readonly instanceHost: string;
	readonly manifestPath: string;
};

// The manifest lives in backend/, where the load bot looks for it.
export function readSeedConfig(): SeedConfig {
	return {
		controlPlaneUrl: process.env.SEED_CONTROL_PLANE_URL || DEFAULT_CONTROL_PLANE_URL,
		adminApiToken: readRequiredEnv('ADMIN_API_TOKEN'),
		instanceHost: process.env.SEED_INSTANCE_HOST || DEFAULT_INSTANCE_HOST,
		manifestPath: backendPath(MANIFEST_FILE_NAME),
	};
}
