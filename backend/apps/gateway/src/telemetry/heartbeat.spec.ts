import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { heartbeatKey } from '@pyle/shared/contracts/redis-keys.js';

import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { Heartbeat, HEARTBEAT_TTL_MULTIPLIER, type HeartbeatRedis } from './heartbeat.js';

const INTERVAL_MS = 5000;

function build() {
	const redis = { set: vi.fn().mockResolvedValue('OK'), del: vi.fn().mockResolvedValue(1) };
	const onBeat = vi.fn().mockResolvedValue(undefined);
	const lines: string[] = [];
	let isDegraded = false;
	const heartbeat = new Heartbeat({
		redis: redis as unknown as HeartbeatRedis,
		gatewayId: 'gw-1',
		startedAtMs: 0,
		intervalMs: INTERVAL_MS,
		configVersion: () => 7,
		isRateLimitDegraded: () => isDegraded,
		now: Date.now,
		logger: new GatewayLogger('gw-1', (line) => lines.push(line)),
		onBeat,
	});

	return { heartbeat, redis, onBeat, lines, degrade: () => (isDegraded = true) };
}

describe('Heartbeat', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('beats at once and then every interval, with a TTL of three intervals', async () => {
		const { heartbeat, redis, onBeat, degrade } = build();

		heartbeat.start();
		await vi.advanceTimersByTimeAsync(0);
		degrade();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);

		expect(redis.set).toHaveBeenCalledTimes(2);
		const [key, value, mode, ttl] = redis.set.mock.calls[0] as [string, string, string, number];

		expect([key, mode, ttl]).toEqual([heartbeatKey('gw-1'), 'PX', INTERVAL_MS * HEARTBEAT_TTL_MULTIPLIER]);
		expect(JSON.parse(value)).toEqual({
			gatewayId: 'gw-1',
			startedAt: '1970-01-01T00:00:00.000Z',
			configVersion: 7,
			isRateLimitDegraded: false,
			updatedAt: '1970-01-01T00:00:01.000Z',
		});
		expect(JSON.parse(redis.set.mock.calls[1][1] as string).isRateLimitDegraded).toBe(true);
		expect(onBeat).toHaveBeenCalledTimes(2);
		await heartbeat.stop();
	});

	it('deletes its key on stop and beats no more', async () => {
		const { heartbeat, redis } = build();

		heartbeat.start();

		await heartbeat.stop();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS * 3);

		expect(redis.del).toHaveBeenCalledWith(heartbeatKey('gw-1'));
		expect(redis.set).toHaveBeenCalledTimes(1);
		expect(vi.getTimerCount()).toBe(0);
	});

	it('logs Redis failures and keeps beating', async () => {
		const { heartbeat, redis, lines } = build();

		redis.set.mockRejectedValueOnce(new Error('down'));
		redis.del.mockRejectedValueOnce(new Error('down'));

		heartbeat.start();
		await vi.advanceTimersByTimeAsync(INTERVAL_MS);
		await heartbeat.stop();

		expect(redis.set).toHaveBeenCalledTimes(2);
		expect(lines.some((line) => line.includes('Could not write the heartbeat'))).toBe(true);
	});
});
