import type { IncomingHttpHeaders } from 'node:http';

import { hashApiKey } from '@pyle/shared/contracts/api-key.js';
import type { ConsumerConfig, RouteConfig } from '@pyle/shared/contracts/config-snapshot.js';

import type { RouteTable } from '../routing/route-table.js';
import type { ApiKeyCache } from './api-key-cache.js';

const BEARER_PATTERN = /^Bearer\s+(\S+)$/i;

type AuthenticationResult =
	| { readonly kind: 'anonymous' }
	| { readonly kind: 'consumer'; readonly consumer: ConsumerConfig; readonly keyId: string }
	| { readonly kind: 'rejected'; readonly error: 'missing_api_key' | 'invalid_api_key' | 'route_not_allowed' };

type AuthenticateInput = {
	readonly headers: IncomingHttpHeaders;
	readonly route: RouteConfig;
	readonly table: RouteTable;
	readonly keys: ApiKeyCache;
};

// A public route still recognizes a valid
// key (for usage metrics) but never rejects for a missing or bad one.
export async function authenticate(input: AuthenticateInput): Promise<AuthenticationResult> {
	const key = readBearerKey(input.headers);

	if (!input.route.isAuthRequired) {
		if (key === null) {
			return { kind: 'anonymous' };
		}

		const result = await resolveConsumer(key, input);

		return result.kind === 'consumer' ? result : { kind: 'anonymous' };
	}

	if (key === null) {
		return { kind: 'rejected', error: 'missing_api_key' };
	}

	return resolveConsumer(key, input);
}

function readBearerKey(headers: IncomingHttpHeaders): string | null {
	const header = headers.authorization;

	if (!header) {
		return null;
	}

	return BEARER_PATTERN.exec(header)?.[1] ?? null;
}

// The consumer comes from the loaded configuration, not the key lookup, so
// a limit or scope change applies at the next reload.
async function resolveConsumer(key: string, input: AuthenticateInput): Promise<AuthenticationResult> {
	const resolved = await input.keys.resolve(hashApiKey(key));
	const consumer = resolved ? input.table.consumer(resolved.consumerId) : null;

	if (!resolved || !consumer) {
		return { kind: 'rejected', error: 'invalid_api_key' };
	}

	const isScoped = consumer.allowedRouteIds.length > 0;
	const isAllowed = !isScoped || consumer.allowedRouteIds.includes(input.route.id);

	if (!isAllowed) {
		return { kind: 'rejected', error: 'route_not_allowed' };
	}

	return { kind: 'consumer', consumer, keyId: resolved.keyId };
}
