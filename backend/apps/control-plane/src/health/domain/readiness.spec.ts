import { describe, expect, it } from 'vitest';

import { evaluateReadiness } from './readiness.js';

describe('evaluateReadiness', () => {
	it('is ready when the control-plane Postgres and Redis are up, whatever the gateway says', () => {
		const result = evaluateReadiness([
			{ component: 'control_plane_db_primary', status: 'up', detail: null },
			{ component: 'control_plane_redis', status: 'up', detail: null },
			{ component: 'gateway', status: 'down', detail: 'no heartbeat' },
		]);

		expect(result).toEqual({ status: 'ready', components: { control_plane_db_primary: 'up', control_plane_redis: 'up' } });
	});

	it('is not ready when a required component is degraded or down', () => {
		const result = evaluateReadiness([
			{ component: 'control_plane_db_primary', status: 'up', detail: null },
			{ component: 'control_plane_redis', status: 'degraded', detail: 'slow' },
		]);

		expect(result.status).toBe('not_ready');
	});

	it('is not ready before the first check has run', () => {
		expect(evaluateReadiness([])).toEqual({
			status: 'not_ready',
			components: { control_plane_db_primary: 'unknown', control_plane_redis: 'unknown' },
		});
	});
});
