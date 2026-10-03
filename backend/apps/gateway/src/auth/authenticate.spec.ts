import { describe, expect, it, vi } from 'vitest';

import { hashApiKey } from '@pyle/shared/contracts/api-key.js';

import { RouteTable } from '../routing/route-table.js';
import { buildRoute, buildTestSnapshot, TEST_CONSUMER } from '../testing/build-test-snapshot.js';
import type { ApiKeyCache } from './api-key-cache.js';
import { authenticate } from './authenticate.js';

const KEY = 'pyle_live_valid';
const SCOPED = { ...TEST_CONSUMER, id: 'consumer-scoped', slug: 'scoped', allowedRouteIds: ['other-route'] };
const table = new RouteTable(buildTestSnapshot({ consumers: [TEST_CONSUMER, SCOPED] }));
const PRIVATE_ROUTE = buildRoute({ id: 'orders', pathPrefix: '/api/orders' });
const PUBLIC_ROUTE = buildRoute({ id: 'public', pathPrefix: '/public', isAuthRequired: false });

function keysFor(consumerId: string | null): ApiKeyCache {
	const resolved = consumerId === null ? null : { keyId: 'k1', consumerId };

	return { resolve: vi.fn().mockResolvedValue(resolved) } as unknown as ApiKeyCache;
}

function bearer(key: string) {
	return { authorization: `Bearer ${key}` };
}

describe('authenticate', () => {
	it('accepts a valid key and hashes it before looking it up', async () => {
		const keys = keysFor(TEST_CONSUMER.id);

		const result = await authenticate({ headers: bearer(KEY), route: PRIVATE_ROUTE, table, keys });

		expect(result).toEqual({ kind: 'consumer', consumer: TEST_CONSUMER, keyId: 'k1' });
		expect(keys.resolve).toHaveBeenCalledWith(hashApiKey(KEY));
	});

	it.each([
		['no header', {}],
		['another scheme', { authorization: `Basic ${KEY}` }],
		['an empty bearer', { authorization: 'Bearer ' }],
	])('asks for a key with %s', async (_label, headers) => {
		expect(await authenticate({ headers, route: PRIVATE_ROUTE, table, keys: keysFor(TEST_CONSUMER.id) })).toEqual({
			kind: 'rejected',
			error: 'missing_api_key',
		});
	});

	it('rejects an unknown or revoked key', async () => {
		expect(await authenticate({ headers: bearer(KEY), route: PRIVATE_ROUTE, table, keys: keysFor(null) })).toEqual({
			kind: 'rejected',
			error: 'invalid_api_key',
		});
	});

	it('rejects a key whose consumer is not in the loaded configuration', async () => {
		expect(await authenticate({ headers: bearer(KEY), route: PRIVATE_ROUTE, table, keys: keysFor('deleted') })).toEqual({
			kind: 'rejected',
			error: 'invalid_api_key',
		});
	});

	it('keeps a scoped consumer to its routes', async () => {
		const result = await authenticate({ headers: bearer(KEY), route: PRIVATE_ROUTE, table, keys: keysFor(SCOPED.id) });

		expect(result).toEqual({ kind: 'rejected', error: 'route_not_allowed' });
	});

	it('lets a scoped consumer through on a route it has', async () => {
		const route = buildRoute({ id: 'other-route', pathPrefix: '/other' });

		expect((await authenticate({ headers: bearer(KEY), route, table, keys: keysFor(SCOPED.id) })).kind).toBe('consumer');
	});

	it('lets anyone through a public route, recognizing a valid key', async () => {
		expect(await authenticate({ headers: {}, route: PUBLIC_ROUTE, table, keys: keysFor(null) })).toEqual({ kind: 'anonymous' });
		expect((await authenticate({ headers: bearer(KEY), route: PUBLIC_ROUTE, table, keys: keysFor(TEST_CONSUMER.id) })).kind).toBe('consumer');
		expect(await authenticate({ headers: bearer(KEY), route: PUBLIC_ROUTE, table, keys: keysFor(null) })).toEqual({ kind: 'anonymous' });
	});
});
