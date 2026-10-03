import { describe, expect, it, vi } from 'vitest';

import type { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';
import { InstanceLiveStateReader } from './instance-live-state.reader.js';

const LIVE = {
	instanceId: 'i1',
	gatewayId: 'gw',
	health: 'healthy',
	circuit: 'closed',
	inFlight: 2,
	consecutiveFailures: 0,
	lastCheckAt: null,
	lastCheckLatencyMs: null,
	updatedAt: '2026-09-25T10:00:00.000Z',
};

function readerFor(hash: Record<string, string>): InstanceLiveStateReader {
	const redis = { hgetall: vi.fn().mockResolvedValue(hash) } as unknown as ControlPlaneRedisService;

	return new InstanceLiveStateReader(redis);
}

describe('InstanceLiveStateReader', () => {
	it('reads every instance the gateways mirrored', async () => {
		const states = await readerFor({ i1: JSON.stringify(LIVE) }).readAll();

		expect(states.get('i1')).toEqual(LIVE);
	});

	it.each([
		['invalid JSON', '{nope'],
		['a non-object', '[1]'],
		['an unknown health', JSON.stringify({ ...LIVE, health: 'melting' })],
		['a missing counter', JSON.stringify({ ...LIVE, inFlight: undefined })],
		['a missing identity', JSON.stringify({ ...LIVE, gatewayId: 3 })],
		['no timestamp', JSON.stringify({ ...LIVE, updatedAt: null })],
	])('skips an entry with %s instead of serving it', async (_label, json) => {
		const states = await readerFor({ i1: json, i2: JSON.stringify({ ...LIVE, instanceId: 'i2' }) }).readAll();

		expect([...states.keys()]).toEqual(['i2']);
	});
});
