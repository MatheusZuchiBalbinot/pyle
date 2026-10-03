import { Injectable } from '@nestjs/common';
import type { Request } from 'express';

import { ScopedThrottlerGuard } from '../../rate-limiting/interface/scoped-throttler.guard.js';

// Keyed by IP and email: one typo must not lock a shared office out, and rotating IPs must
// not give unlimited tries at one account.
@Injectable()
export class LoginThrottlerGuard extends ScopedThrottlerGuard {
	protected readonly throttlerName = 'login';

	protected override getTracker(req: Record<string, unknown>): Promise<string> {
		const request = req as unknown as Request;
		const body = request.body as { readonly email?: unknown } | undefined;
		const email = typeof body?.email === 'string' ? body.email.toLowerCase() : 'unknown';
		const ip = request.ip ?? 'unknown-ip';

		return Promise.resolve(`login:${ip}:${email}`);
	}
}
