import { Redis } from 'ioredis';

import { getControlPlaneRedisUrl } from '../../apps/control-plane/src/config/control-plane-redis.js';

// The throttler keeps its windows in the shared Redis (RedisThrottlerStorage), so a suite
// that exhausts a limit would block the next run for the rest of the window.
const THROTTLE_KEY_PREFIX = 'pyle:throttle';
const SCAN_BATCH_SIZE = 100;

export async function clearThrottler(throttlerName: string): Promise<void> {
	const redis = new Redis(getControlPlaneRedisUrl(), { maxRetriesPerRequest: 1 });

	try {
		const keys = await scanKeys(redis, `${THROTTLE_KEY_PREFIX}:${throttlerName}:*`);

		if (keys.length > 0) {
			await redis.del(...keys);
		}
	} finally {
		await redis.quit();
	}
}

async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
	const keys: string[] = [];

	for await (const batch of redis.scanStream({ match: pattern, count: SCAN_BATCH_SIZE })) {
		keys.push(...(batch as string[]));
	}

	return keys;
}
