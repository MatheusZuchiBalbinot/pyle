import { describe, expect, it, vi } from 'vitest';

import { INSTANCE_STATE_HASH } from '@pyle/shared/contracts/redis-keys.js';

import type { InstanceRuntimeState, InstanceStateSource } from '../contracts/instance-state-source.js';
import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { InstanceStateMirror, type MirrorRedis } from './instance-state-mirror.js';

const STATE: InstanceRuntimeState = {
	instanceId: 'i1',
	health: 'healthy',
	circuit: 'closed',
	inFlight: 2,
	consecutiveFailures: 0,
	lastCheckAt: 1000,
	lastCheckLatencyMs: 4,
};

function build(states: readonly InstanceRuntimeState[] = [STATE]) {
	let listener: (state: InstanceRuntimeState) => void = () => undefined;
	const unsubscribe = vi.fn();
	const source: InstanceStateSource = {
		list: () => states,
		onChange: (next) => {
			listener = next;

			return unsubscribe;
		},
	};
	const redis = { hset: vi.fn().mockResolvedValue(1), hmget: vi.fn().mockResolvedValue([]), hdel: vi.fn().mockResolvedValue(1) };
	const lines: string[] = [];
	const mirror = new InstanceStateMirror({
		redis: redis as unknown as MirrorRedis,
		gatewayId: 'gw-1',
		source: () => source,
		now: () => 2000,
		logger: new GatewayLogger('gw-1', (line) => lines.push(line)),
	});

	return { mirror, redis, lines, unsubscribe, change: (state: InstanceRuntimeState) => listener(state) };
}

describe('InstanceStateMirror', () => {
	it('writes the live state of every instance at once', async () => {
		const { mirror, redis } = build([STATE, { ...STATE, instanceId: 'i2', lastCheckAt: null }]);

		await mirror.writeAll();

		const [key, fields] = redis.hset.mock.calls[0] as [string, Record<string, string>];

		expect(key).toBe(INSTANCE_STATE_HASH);
		expect(JSON.parse(fields.i1)).toEqual({
			instanceId: 'i1',
			gatewayId: 'gw-1',
			health: 'healthy',
			circuit: 'closed',
			inFlight: 2,
			consecutiveFailures: 0,
			lastCheckAt: '1970-01-01T00:00:01.000Z',
			lastCheckLatencyMs: 4,
			updatedAt: '1970-01-01T00:00:02.000Z',
		});
		expect(JSON.parse(fields.i2).lastCheckAt).toBeNull();
	});

	it('writes each change as it happens until stopped', async () => {
		const { mirror, redis, change, unsubscribe } = build();

		mirror.start();

		change({ ...STATE, health: 'unhealthy' });
		mirror.stop();

		await vi.waitFor(() => expect(redis.hset).toHaveBeenCalledTimes(1));
		expect(unsubscribe).toHaveBeenCalled();
	});

	it('removes only its own entries for instances no longer configured', async () => {
		const { mirror, redis } = build([STATE, { ...STATE, instanceId: 'i2' }, { ...STATE, instanceId: 'i3' }]);

		await mirror.writeAll();
		redis.hmget.mockResolvedValue([JSON.stringify({ gatewayId: 'gw-1' }), JSON.stringify({ gatewayId: 'gw-2' })]);

		await mirror.retainOnly(new Set(['i1']));
		await mirror.retainOnly(new Set(['i1']));

		expect(redis.hmget).toHaveBeenCalledTimes(1);
		expect(redis.hmget).toHaveBeenCalledWith(INSTANCE_STATE_HASH, 'i2', 'i3');
		expect(redis.hdel).toHaveBeenCalledWith(INSTANCE_STATE_HASH, 'i2');
	});

	it('leaves unreadable or missing entries alone', async () => {
		const { mirror, redis } = build([STATE, { ...STATE, instanceId: 'i2' }]);

		await mirror.writeAll();
		redis.hmget.mockResolvedValue(['{not json', null]);

		await mirror.retainOnly(new Set());

		expect(redis.hdel).not.toHaveBeenCalled();
	});

	it('writes nothing for no instances and logs Redis failures', async () => {
		const empty = build([]);

		await empty.mirror.writeAll();
		expect(empty.redis.hset).not.toHaveBeenCalled();

		const { mirror, redis, lines } = build();

		redis.hset.mockRejectedValue(new Error('down'));
		await mirror.writeAll();
		redis.hmget.mockRejectedValue(new Error('down'));
		await mirror.retainOnly(new Set());

		expect(lines.filter((line) => line.includes('Could not mirror'))).toHaveLength(1);
	});
});
