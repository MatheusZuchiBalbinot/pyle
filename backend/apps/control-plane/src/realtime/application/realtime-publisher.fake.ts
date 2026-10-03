import { vi } from 'vitest';

import type { RealtimePublisherService } from './realtime-publisher.service.js';

// Records calls, publishes nothing. *.fake.ts stays out of the production build.
export function buildRealtimePublisherFake(): RealtimePublisherService {
	return {
		publishToAdmins: vi.fn().mockResolvedValue(undefined),
	} as unknown as RealtimePublisherService;
}
