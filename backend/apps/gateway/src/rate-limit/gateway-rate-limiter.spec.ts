import { describe, expect, it, vi } from 'vitest';

import { buildRoute, TEST_CONSUMER } from '../testing/build-test-snapshot.js';
import { GatewayRateLimiter } from './gateway-rate-limiter.js';

const NOW = 125_000;
const ROUTE = buildRoute({ id: 'r1', pathPrefix: '/api/orders' });
const LIMITED_ROUTE = buildRoute({ id: 'r1', pathPrefix: '/api/orders', rateLimitPerMinute: 5 });
const CONSUMER = { ...TEST_CONSUMER, rateLimitPerMinute: 10 };

// A fake Redis that counts per key like the Lua script does.
function buildRedis() {
	const counts = new Map<string, number>();
	const evalFn = vi.fn(async (_script: string, _keys: number, key: string, windowMs: number) => {
		const count = (counts.get(key) ?? 0) + 1;

		counts.set(key, count);

		return [count, windowMs - 5000];
	});

	return { eval: evalFn, counts };
}

function hit(limiter: GatewayRateLimiter, times: number, input: Parameters<GatewayRateLimiter['check']>[0]) {
	return Promise.all(Array.from({ length: times }, () => limiter.check(input))).then((results) => results.at(-1));
}

describe('GatewayRateLimiter', () => {
	it('lets a request through with the consumer limit in the headers', async () => {
		const decision = await new GatewayRateLimiter(buildRedis()).check({ consumer: CONSUMER, route: ROUTE, clientIp: '1.1.1.1', nowMs: NOW });

		expect(decision).toEqual({ kind: 'allowed', headers: { limit: 10, remaining: 9, resetAtSeconds: 180 } });
	});

	it('keys the consumer window by the minute', async () => {
		const redis = buildRedis();

		await new GatewayRateLimiter(redis).check({ consumer: CONSUMER, route: ROUTE, clientIp: '1.1.1.1', nowMs: NOW });

		expect([...redis.counts.keys()]).toEqual(['pyle:gw:rl:consumer:consumer-web:120000']);
	});

	it('answers 429 for the consumer past its limit, with when to retry', async () => {
		const decision = await hit(new GatewayRateLimiter(buildRedis()), 11, { consumer: CONSUMER, route: ROUTE, clientIp: '1.1.1.1', nowMs: NOW });

		expect(decision).toEqual({
			kind: 'limited',
			scope: 'consumer',
			retryAfterSeconds: 55,
			headers: { limit: 10, remaining: 0, resetAtSeconds: 180 },
		});
	});

	it('applies the route limit per consumer too', async () => {
		const decision = await hit(new GatewayRateLimiter(buildRedis()), 6, {
			consumer: CONSUMER,
			route: LIMITED_ROUTE,
			clientIp: '1.1.1.1',
			nowMs: NOW,
		});

		expect(decision).toMatchObject({ kind: 'limited', scope: 'route' });
	});

	it('limits anonymous callers of a public route by address, and leaves unlimited ones alone', async () => {
		const redis = buildRedis();
		const limiter = new GatewayRateLimiter(redis);

		await limiter.check({ consumer: null, route: LIMITED_ROUTE, clientIp: '10.0.0.1', nowMs: NOW });
		expect([...redis.counts.keys()]).toEqual(['pyle:gw:rl:route:r1:anon:10.0.0.1:120000']);
		expect(await limiter.check({ consumer: null, route: ROUTE, clientIp: '10.0.0.1', nowMs: NOW })).toEqual({ kind: 'allowed', headers: null });
	});

	it('fails open when Redis is down', async () => {
		const redis = { eval: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) };

		expect(await new GatewayRateLimiter(redis).check({ consumer: CONSUMER, route: ROUTE, clientIp: '1.1.1.1', nowMs: NOW })).toEqual({
			kind: 'degraded',
		});
	});

	it('never tells a client to retry in zero seconds at the very end of a window', async () => {
		const decision = await hit(new GatewayRateLimiter(buildRedis()), 11, { consumer: CONSUMER, route: ROUTE, clientIp: '1.1.1.1', nowMs: 179_999 });

		expect(decision).toMatchObject({ kind: 'limited', retryAfterSeconds: 1 });
	});
});
