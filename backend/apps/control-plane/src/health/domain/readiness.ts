import type { SystemHealthStatus } from '@prisma/control-plane-client';

import type { SystemHealthComponentStatusDto } from '../../system-health/interface/dto/system-health-component-status.dto.js';

// Postgres and Redis only: a gateway being down must not take the console down.
const REQUIRED_COMPONENTS = ['control_plane_db_primary', 'control_plane_redis'] as const;

// `unknown` until the first check has run (right after boot).
export type ComponentReadiness = SystemHealthStatus | 'unknown';

export type ReadinessComponents = Readonly<Record<RequiredComponent, ComponentReadiness>>;

export type ReadinessResponse = {
	readonly status: 'ready' | 'not_ready';
	// Status only: details stay behind the admin-guarded /admin/system/health.
	readonly components: ReadinessComponents;
};

type RequiredComponent = (typeof REQUIRED_COMPONENTS)[number];

export function evaluateReadiness(statuses: readonly SystemHealthComponentStatusDto[]): ReadinessResponse {
	const statusByComponent = new Map<string, SystemHealthStatus>(statuses.map((entry) => [entry.component, entry.status]));
	const toReadiness = (component: RequiredComponent): ComponentReadiness => statusByComponent.get(component) ?? 'unknown';
	const components: Record<RequiredComponent, ComponentReadiness> = {
		control_plane_db_primary: toReadiness('control_plane_db_primary'),
		control_plane_redis: toReadiness('control_plane_redis'),
	};
	const isReady = REQUIRED_COMPONENTS.every((component) => components[component] === 'up');

	return { status: isReady ? 'ready' : 'not_ready', components };
}
