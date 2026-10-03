import type { ComponentReadiness, ReadinessComponents, ReadinessResponse } from '../../domain/readiness.js';

export class LivenessResponse {
	readonly status!: 'ok';
	readonly uptimeSeconds!: number;
}

// `unknown` until the first check has run (right after boot).
class ReadinessComponentsDto implements ReadinessComponents {
	readonly control_plane_db_primary!: ComponentReadiness;
	readonly control_plane_redis!: ComponentReadiness;
}

export class ReadinessResponseDto implements ReadinessResponse {
	readonly status!: 'ready' | 'not_ready';
	// Status only: details stay behind the admin-guarded /admin/system/health.
	readonly components!: ReadinessComponentsDto;
}
