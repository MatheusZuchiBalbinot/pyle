import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

import { RedisThrottlerStorage } from '../../apps/control-plane/src/rate-limiting/infrastructure/redis-throttler-storage.js';

// Two storages are two gateway replicas: the whole point of keeping the
// counters in Redis is that they see — and enforce — the same count.
const WINDOW_MS = 60_000;
const LIMIT = 3;
const THROTTLER = 'feature-spec';

describe('Redis throttler storage (feature)', () => {
	const replicaA = new RedisThrottlerStorage();
	const replicaB = new RedisThrottlerStorage();

	afterAll(async () => {
		await replicaA.onModuleDestroy();
		await replicaB.onModuleDestroy();
	});

	it('counts hits from every replica against the same limit', async () => {
		const key = randomUUID();

		await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);
		await replicaB.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);
		const third = await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);

		expect(third).toEqual(expect.objectContaining({ totalHits: 3, isBlocked: false }));
		expect(third.timeToExpire).toBeGreaterThan(0);
	});

	it('blocks the key on every replica once the limit is passed', async () => {
		const key = randomUUID();

		for (let hit = 0; hit < LIMIT; hit += 1) {
			await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);
		}

		const overLimit = await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);
		const fromOtherReplica = await replicaB.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);

		expect(overLimit.isBlocked).toBe(true);
		expect(fromOtherReplica.isBlocked).toBe(true);
		expect(fromOtherReplica.timeToBlockExpire).toBeGreaterThan(0);
	});

	it('keeps separate throttlers and keys apart', async () => {
		const key = randomUUID();

		for (let hit = 0; hit <= LIMIT; hit += 1) {
			await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);
		}

		const otherThrottler = await replicaA.increment(key, WINDOW_MS, LIMIT, WINDOW_MS, 'another-throttler');
		const otherKey = await replicaA.increment(randomUUID(), WINDOW_MS, LIMIT, WINDOW_MS, THROTTLER);

		expect(otherThrottler).toEqual(expect.objectContaining({ totalHits: 1, isBlocked: false }));
		expect(otherKey).toEqual(expect.objectContaining({ totalHits: 1, isBlocked: false }));
	});
});
