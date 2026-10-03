import type { HttpMethodName } from './services';

export type RouteServiceRef = {
	readonly id: string;
	readonly slug: string;
	readonly name: string;
};

export type Route = {
	readonly id: string;
	readonly name: string;
	readonly pathPrefix: string;
	readonly service: RouteServiceRef;
	readonly stripPrefix: boolean;
	// Empty = every method.
	readonly methods: readonly HttpMethodName[];
	readonly isAuthRequired: boolean;
	readonly rateLimitPerMinute: number | null;
	readonly timeoutMs: number | null;
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type CreateRouteInput = {
	readonly name: string;
	readonly pathPrefix: string;
	readonly serviceSlug: string;
	readonly stripPrefix?: boolean;
	readonly methods?: readonly HttpMethodName[];
	readonly isAuthRequired?: boolean;
	readonly rateLimitPerMinute?: number | null;
	readonly timeoutMs?: number | null;
};

export type UpdateRouteInput = Partial<CreateRouteInput>;
