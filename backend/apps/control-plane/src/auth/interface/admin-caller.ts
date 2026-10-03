import type { Request } from 'express';

// Attached by AdminAuthGuard, so anything downstream can attribute an action.
export type AdminCaller = { readonly kind: 'user'; readonly userId: string; readonly email: string } | { readonly kind: 'service' };

const ADMIN_CALLER_PROPERTY = 'adminCaller';

type RequestWithCaller = Request & { [ADMIN_CALLER_PROPERTY]?: AdminCaller };

export function setAdminCaller(request: Request, caller: AdminCaller): void {
	(request as RequestWithCaller)[ADMIN_CALLER_PROPERTY] = caller;
}

export function getAdminCaller(request: Request): AdminCaller | undefined {
	return (request as RequestWithCaller)[ADMIN_CALLER_PROPERTY];
}
