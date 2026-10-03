import { describe, expect, it, vi } from 'vitest';

import type { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';
import { GatewayHeartbeatReader } from './gateway-heartbeat.reader.js';

const HEARTBEAT = { gatewayId: 'gw-1', startedAt: 'a', configVersion: 1, isRateLimitDegraded: false, updatedAt: 'b' };

describe('GatewayHeartbeatReader', () => {
	it('scans every heartbeat key and keeps the well-formed ones', async () => {
		const scan = vi
			.fn()
			.mockResolvedValueOnce(['7', ['pyle:gw:heartbeat:gw-1', 'pyle:gw:heartbeat:gw-2']])
			.mockResolvedValueOnce(['0', ['pyle:gw:heartbeat:gw-3', 'pyle:gw:heartbeat:gw-1', 'pyle:gw:heartbeat:gw-4']]);
		const mget = vi.fn().mockResolvedValue([JSON.stringify(HEARTBEAT), null, '{broken', JSON.stringify({ gatewayId: 'gw-4' })]);
		const reader = new GatewayHeartbeatReader({ scan, mget } as unknown as ControlPlaneRedisService);

		expect(await reader.readAll()).toEqual([HEARTBEAT]);
		expect(mget).toHaveBeenCalledWith('pyle:gw:heartbeat:gw-1', 'pyle:gw:heartbeat:gw-2', 'pyle:gw:heartbeat:gw-3', 'pyle:gw:heartbeat:gw-4');
	});

	it('asks nothing more when no gateway is running', async () => {
		const mget = vi.fn();
		const reader = new GatewayHeartbeatReader({ scan: vi.fn().mockResolvedValue(['0', []]), mget } as unknown as ControlPlaneRedisService);

		expect(await reader.readAll()).toEqual([]);
		expect(mget).not.toHaveBeenCalled();
	});
});
