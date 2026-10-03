import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions, ThrottlerOptions, ThrottlerStorage } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { ScopedThrottlerGuard } from './scoped-throttler.guard.js';

class LoginOnlyGuard extends ScopedThrottlerGuard {
	protected readonly throttlerName = 'login';

	activeThrottlers(): readonly ThrottlerOptions[] {
		return this.throttlers;
	}
}

describe('ScopedThrottlerGuard', () => {
	it('keeps only its own named throttler, so other buckets never count its routes', async () => {
		const options: ThrottlerModuleOptions = {
			throttlers: [
				{ name: 'other', ttl: 10_000, limit: 300 },
				{ name: 'login', ttl: 900_000, limit: 10 },
				{ name: 'assistant', ttl: 60_000, limit: 12 },
			],
		};
		const guard = new LoginOnlyGuard(options, {} as ThrottlerStorage, new Reflector());

		await guard.onModuleInit();

		expect(guard.activeThrottlers().map((throttler) => throttler.name)).toEqual(['login']);
	});
});
