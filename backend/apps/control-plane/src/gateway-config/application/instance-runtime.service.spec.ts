import { describe, expect, it, vi } from 'vitest';

import type { ChaosStateStore } from '../infrastructure/chaos-state.store.js';
import type { InstanceLiveStateReader } from '../infrastructure/instance-live-state.reader.js';
import { NO_RUNTIME } from '../interface/dto/gateway-config-responses.js';
import { InstanceRuntimeService } from './instance-runtime.service.js';

describe('InstanceRuntimeService', () => {
	it('combines the live state and the chaos of the instances', async () => {
		const live = new Map([['i1', { instanceId: 'i1' }]]);
		const chaos = new Map([['i1', { latencyMs: 1, jitterMs: 0, errorRate: 0, isDown: false }]]);
		const reader = { readAll: vi.fn().mockResolvedValue(live) } as unknown as InstanceLiveStateReader;
		const store = { readMany: vi.fn().mockResolvedValue(chaos) } as unknown as ChaosStateStore;

		const runtime = await new InstanceRuntimeService(reader, store).load(['i1']);

		expect(runtime).toEqual({ liveByInstanceId: live, chaosByInstanceId: chaos });
	});

	it('degrades to no runtime when Redis cannot be read', async () => {
		const reader = { readAll: vi.fn().mockRejectedValue(new Error('down')) } as unknown as InstanceLiveStateReader;
		const store = { readMany: vi.fn().mockResolvedValue(new Map()) } as unknown as ChaosStateStore;

		expect(await new InstanceRuntimeService(reader, store).load(['i1'])).toBe(NO_RUNTIME);
	});
});
