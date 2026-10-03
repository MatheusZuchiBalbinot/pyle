import { describe, expect, it } from 'vitest';

import { hasActiveChaos, NO_CHAOS } from './chaos-state.js';

describe('hasActiveChaos', () => {
	it('is false when every fault is off', () => {
		expect(hasActiveChaos(NO_CHAOS)).toBe(false);
	});

	it.each([{ latencyMs: 1 }, { jitterMs: 1 }, { errorRate: 0.1 }, { isDown: true }])('is true with %j', (fault) => {
		expect(hasActiveChaos({ ...NO_CHAOS, ...fault })).toBe(true);
	});
});
