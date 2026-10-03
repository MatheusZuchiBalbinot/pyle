import type { ConsumerConfig, RouteConfig } from '@pyle/shared/contracts/config-snapshot.js';
import type { RateLimitScope } from '@pyle/shared/contracts/gateway-error.js';
import { anonymousConsumerKey, consumerRateLimitKey, routeRateLimitKey } from '@pyle/shared/contracts/redis-keys.js';
import { incrementFixedWindow, type RedisScriptRunner } from '@pyle/shared/utils/redis-fixed-window.js';

// Fixed 60 s windows aligned on the minute, so every gateway counts into
// the same bucket. See ADR 8.
const RATE_LIMIT_WINDOW_MS = 60_000;
const MS_PER_SECOND = 1000;

export type RateLimitHeaders = {
	readonly limit: number;
	readonly remaining: number;
	// Epoch seconds when the window resets.
	readonly resetAtSeconds: number;
};

export type RateLimitDecision =
	| { readonly kind: 'allowed'; readonly headers: RateLimitHeaders | null }
	| { readonly kind: 'limited'; readonly scope: RateLimitScope; readonly retryAfterSeconds: number; readonly headers: RateLimitHeaders }
	// Redis could not be reached: the request goes through (fail open).
	| { readonly kind: 'degraded' };

type RateLimitInput = {
	readonly consumer: ConsumerConfig | null;
	readonly route: RouteConfig;
	readonly clientIp: string;
	readonly nowMs: number;
};

type WindowCheck = { readonly scope: RateLimitScope; readonly limit: number; readonly key: string };

type CheckedWindow = WindowCheck & { readonly count: number };

// Counts the request against the consumer's limit and the route's, in
// that order; the first one exceeded answers. Both counters move in
// parallel (one round trip each), so a rejected request still counts:
// hammering does not reset the window.
export class GatewayRateLimiter {
	constructor(private readonly redis: RedisScriptRunner) {}

	async check(input: RateLimitInput): Promise<RateLimitDecision> {
		const start = windowStart(input.nowMs);
		const resetAtMs = start + RATE_LIMIT_WINDOW_MS;
		const checks = windowsFor(input, start);

		if (checks.length === 0) {
			return { kind: 'allowed', headers: null };
		}

		const counted = await this.countAll(checks, input.nowMs);

		if (counted === null) {
			return { kind: 'degraded' };
		}

		const exceeded = counted.find((window) => window.count > window.limit);

		if (exceeded) {
			const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - input.nowMs) / MS_PER_SECOND));

			return { kind: 'limited', scope: exceeded.scope, retryAfterSeconds, headers: toHeaders(exceeded, resetAtMs) };
		}

		return { kind: 'allowed', headers: toHeaders(counted[0], resetAtMs) };
	}

	// Null when Redis could not be reached. Availability over enforcement:
	// the caller logs it and flags the gateway as degraded.
	private async countAll(checks: readonly WindowCheck[], nowMs: number): Promise<readonly CheckedWindow[] | null> {
		try {
			return await Promise.all(checks.map((check) => this.count(check, nowMs)));
		} catch {
			return null;
		}
	}

	private async count(check: WindowCheck, nowMs: number): Promise<CheckedWindow> {
		const window = await incrementFixedWindow(this.redis, { key: check.key, windowMs: RATE_LIMIT_WINDOW_MS, nowMs });

		return { ...check, count: window.count };
	}
}

function windowStart(nowMs: number): number {
	return Math.floor(nowMs / RATE_LIMIT_WINDOW_MS) * RATE_LIMIT_WINDOW_MS;
}

function toHeaders(window: CheckedWindow, resetAtMs: number): RateLimitHeaders {
	return { limit: window.limit, remaining: Math.max(0, window.limit - window.count), resetAtSeconds: Math.ceil(resetAtMs / MS_PER_SECOND) };
}

function windowsFor(input: RateLimitInput, start: number): readonly WindowCheck[] {
	const checks: WindowCheck[] = [];

	if (input.consumer) {
		checks.push({ scope: 'consumer', limit: input.consumer.rateLimitPerMinute, key: consumerRateLimitKey(input.consumer.id, start) });
	}

	if (input.route.rateLimitPerMinute !== null) {
		const consumerKey = input.consumer ? input.consumer.id : anonymousConsumerKey(input.clientIp);

		checks.push({ scope: 'route', limit: input.route.rateLimitPerMinute, key: routeRateLimitKey(input.route.id, consumerKey, start) });
	}

	return checks;
}
