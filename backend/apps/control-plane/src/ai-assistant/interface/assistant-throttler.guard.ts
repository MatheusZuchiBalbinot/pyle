import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { getAdminCaller } from '../../auth/interface/admin-caller.js';
import { ScopedThrottlerGuard } from '../../rate-limiting/interface/scoped-throttler.guard.js';

// One bucket per operator (runs after AdminAuthGuard, which attaches the
// caller); machine callers with the service token share one.
@Injectable()
export class AssistantThrottlerGuard extends ScopedThrottlerGuard {
	protected readonly throttlerName = 'assistant';

	protected override getTracker(req: Record<string, unknown>): Promise<string> {
		const caller = getAdminCaller(req as unknown as Request);
		const callerKey = caller?.kind === 'user' ? caller.userId : 'service';

		return Promise.resolve(`assistant:${callerKey}`);
	}
}
