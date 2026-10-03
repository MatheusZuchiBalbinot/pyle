import { describe, expect, it, vi } from 'vitest';

import type { ControlPlaneRedisService } from '../../control-plane/redis/control-plane-redis.service.js';
import { ConfigChangePublisher } from './config-change-publisher.js';

describe('ConfigChangePublisher', () => {
	it('publishes the message on the gateways channel', async () => {
		const redis = { publish: vi.fn().mockResolvedValue(1) };

		await new ConfigChangePublisher(redis as unknown as ControlPlaneRedisService).publish({ entity: 'route', id: 'r1', action: 'updated' });

		expect(redis.publish).toHaveBeenCalledWith('pyle:gw:config-changed', JSON.stringify({ entity: 'route', id: 'r1', action: 'updated' }));
	});
});
