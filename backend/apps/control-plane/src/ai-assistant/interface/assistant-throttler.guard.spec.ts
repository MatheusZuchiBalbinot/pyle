import { Reflector } from '@nestjs/core';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { Request } from 'express';
import { describe, expect, it } from 'vitest';

import { setAdminCaller } from '../../auth/interface/admin-caller.js';
import { AssistantThrottlerGuard } from './assistant-throttler.guard.js';

class ExposedGuard extends AssistantThrottlerGuard {
	trackerOf(request: Request): Promise<string> {
		return this.getTracker(request as unknown as Record<string, unknown>);
	}
}

function buildGuard(): ExposedGuard {
	return new ExposedGuard({ throttlers: [] }, {} as ThrottlerStorage, new Reflector());
}

describe('AssistantThrottlerGuard', () => {
	it('keys the bucket by operator, and puts machine callers in one shared bucket', async () => {
		const operatorRequest = {} as Request;

		setAdminCaller(operatorRequest, { kind: 'user', userId: 'u1', email: 'a@b.c' });
		const serviceRequest = {} as Request;

		setAdminCaller(serviceRequest, { kind: 'service' });

		await expect(buildGuard().trackerOf(operatorRequest)).resolves.toBe('assistant:u1');
		await expect(buildGuard().trackerOf(serviceRequest)).resolves.toBe('assistant:service');
	});
});
