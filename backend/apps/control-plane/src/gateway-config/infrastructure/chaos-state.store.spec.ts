import { describe, expect, it, vi } from 'vitest';

import type { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';
import { ChaosStateStore } from './chaos-state.store.js';

const CHAOS = { latencyMs: 800, jitterMs: 0, errorRate: 0.2, isDown: false };

function buildRedis(mgetResult: readonly (string | null)[] = []) {
	return {
		set: vi.fn().mockResolvedValue('OK'),
		del: vi.fn().mockResolvedValue(1),
		mget: vi.fn().mockResolvedValue(mgetResult),
	};
}

function storeWith(redis: ReturnType<typeof buildRedis>): ChaosStateStore {
	return new ChaosStateStore(redis as unknown as ControlPlaneRedisService);
}

describe('ChaosStateStore', () => {
	it('saves and clears under the per-instance key', async () => {
		const redis = buildRedis();
		const store = storeWith(redis);

		await store.save('i1', CHAOS);
		await store.clear('i1');

		expect(redis.set).toHaveBeenCalledWith('pyle:gw:chaos:i1', JSON.stringify(CHAOS));
		expect(redis.del).toHaveBeenCalledWith('pyle:gw:chaos:i1');
	});

	it('reads many at once and skips what is missing or corrupt', async () => {
		const redis = buildRedis([JSON.stringify(CHAOS), null, '{bad', JSON.stringify({ latencyMs: 'x' })]);

		const states = await storeWith(redis).readMany(['i1', 'i2', 'i3', 'i4']);

		expect(redis.mget).toHaveBeenCalledWith(['pyle:gw:chaos:i1', 'pyle:gw:chaos:i2', 'pyle:gw:chaos:i3', 'pyle:gw:chaos:i4']);
		expect([...states.entries()]).toEqual([['i1', CHAOS]]);
	});

	it('does not ask Redis about no instances at all', async () => {
		const redis = buildRedis();

		expect((await storeWith(redis).readMany([])).size).toBe(0);
		expect(redis.mget).not.toHaveBeenCalled();
	});
});
