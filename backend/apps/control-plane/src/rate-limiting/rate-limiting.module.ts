import { Module } from '@nestjs/common';
import { ThrottlerModule, type ThrottlerModuleOptions } from '@nestjs/throttler';

import { RedisThrottlerStorage } from './infrastructure/redis-throttler-storage.js';

// Generous for someone who knows the password, useless for guessing.
export const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;
export const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 10;
// Each turn is several paid model calls: more than anyone types, far less than a runaway
// script.
const ASSISTANT_RATE_LIMIT_WINDOW_MS = 60_000;
const ASSISTANT_RATE_LIMIT_MAX_TURNS = 12;

@Module({ providers: [RedisThrottlerStorage], exports: [RedisThrottlerStorage] })
class ThrottlerStorageModule {}

@Module({
	imports: [ThrottlerModule.forRootAsync({ imports: [ThrottlerStorageModule], inject: [RedisThrottlerStorage], useFactory: buildThrottlerOptions })],
	exports: [ThrottlerModule],
})
export class RateLimitingModule {}

function buildThrottlerOptions(storage: RedisThrottlerStorage): ThrottlerModuleOptions {
	return {
		throttlers: [
			{ name: 'login', ttl: LOGIN_RATE_LIMIT_WINDOW_MS, limit: LOGIN_RATE_LIMIT_MAX_ATTEMPTS },
			{ name: 'assistant', ttl: ASSISTANT_RATE_LIMIT_WINDOW_MS, limit: ASSISTANT_RATE_LIMIT_MAX_TURNS },
		],
		storage,
	};
}
