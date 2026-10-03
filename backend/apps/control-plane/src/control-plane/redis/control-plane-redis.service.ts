import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

import { getControlPlaneRedisUrl } from '../../config/control-plane-redis.js';

const MAX_RETRIES_PER_REQUEST = 1;

// Lazy: a process that never touches Redis never connects. Subscribers need their own
// connection.
@Injectable()
export class ControlPlaneRedisService extends Redis implements OnModuleDestroy {
	constructor() {
		super(getControlPlaneRedisUrl(), { lazyConnect: true, maxRetriesPerRequest: MAX_RETRIES_PER_REQUEST });
	}

	async onModuleDestroy(): Promise<void> {
		await this.quit().catch(() => {
			// Never connected (lazyConnect) or already gone: nothing to close.
		});
	}
}
