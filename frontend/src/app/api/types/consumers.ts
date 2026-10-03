export type ApiKey = {
	readonly id: string;
	readonly keyPrefix: string;
	readonly label: string | null;
	readonly createdAt: string;
	readonly lastUsedAt: string | null;
	readonly revokedAt: string | null;
};

// The only time a key leaves the server in clear.
export type ApiKeyCreated = ApiKey & { readonly key: string };

export type ConsumerRouteRef = {
	readonly id: string;
	readonly name: string;
	readonly pathPrefix: string;
};

export type Consumer = {
	readonly id: string;
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute: number;
	// Empty = every route.
	readonly allowedRoutes: readonly ConsumerRouteRef[];
	// Revoked ones included, newest first.
	readonly apiKeys: readonly ApiKey[];
	readonly createdAt: string;
	readonly updatedAt: string;
};

export type ConsumerCreated = Consumer & { readonly key: string };

export type CreateConsumerInput = {
	readonly slug: string;
	readonly name: string;
	readonly rateLimitPerMinute?: number;
	readonly routeIds?: readonly string[];
};

export type UpdateConsumerInput = {
	readonly name?: string;
	readonly rateLimitPerMinute?: number;
};

export type IssueApiKeyInput = {
	readonly label?: string;
};
