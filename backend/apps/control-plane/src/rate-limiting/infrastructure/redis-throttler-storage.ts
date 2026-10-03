import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';

import { getControlPlaneRedisUrl } from '../../config/control-plane-redis.js';

// Not re-exported by the package's entry point.
type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

const KEY_PREFIX = 'pyle:throttle';
const MS_PER_SECOND = 1000;
const BLOCKED_FLAG = 1;

// Atomic: a fixed window per key plus a block key once the limit is passed.
const INCREMENT_SCRIPT = `
local blockTtl = redis.call('PTTL', KEYS[2])
if blockTtl > 0 then
	local hits = tonumber(redis.call('GET', KEYS[1]) or '0')
	return {hits, redis.call('PTTL', KEYS[1]), 1, blockTtl}
end
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local windowTtl = redis.call('PTTL', KEYS[1])
if hits > tonumber(ARGV[2]) then
	redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
	return {hits, windowTtl, 1, tonumber(ARGV[3])}
end
return {hits, windowTtl, 0, 0}
`;

type ScriptResult = readonly [hits: number, windowTtlMs: number, blocked: number, blockTtlMs: number];

// In Redis, so limits survive a redeploy and are shared by every instance.
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnModuleDestroy {
	private readonly redis = new Redis(getControlPlaneRedisUrl(), { lazyConnect: true, maxRetriesPerRequest: 1 });

	async increment(key: string, ttl: number, limit: number, blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
		const hitsKey = `${KEY_PREFIX}:${throttlerName}:${key}`;
		const blockKey = `${hitsKey}:blocked`;
		// A zero block would be an invalid PX; the guard defaults it to the
		// window anyway.
		const blockMs = Math.max(blockDuration, ttl);
		const result = (await this.redis.eval(INCREMENT_SCRIPT, 2, hitsKey, blockKey, ttl, limit, blockMs)) as ScriptResult;
		const [hits, windowTtlMs, blocked, blockTtlMs] = result;

		return {
			totalHits: hits,
			timeToExpire: toSeconds(windowTtlMs),
			isBlocked: blocked === BLOCKED_FLAG,
			timeToBlockExpire: toSeconds(blockTtlMs),
		};
	}

	async onModuleDestroy(): Promise<void> {
		await this.redis.quit().catch(() => {
			// Never connected (lazyConnect) or already gone: nothing to close.
		});
	}
}

function toSeconds(ms: number): number {
	return Math.max(0, Math.ceil(ms / MS_PER_SECOND));
}
