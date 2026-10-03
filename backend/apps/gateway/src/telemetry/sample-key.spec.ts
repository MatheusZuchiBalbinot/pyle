import { describe, expect, it } from 'vitest';

import { dimensionKey, flushKey } from './sample-key.js';

describe('sample keys', () => {
	it('builds the flush key of the contract, with none for missing ids', () => {
		expect(flushKey({ gatewayId: 'gw-1', bucketStartMs: 10_000, routeId: 'r1', dimensionId: 'i1' })).toBe('gw-1:10000:r1:i1');
		expect(flushKey({ gatewayId: 'gw-1', bucketStartMs: 10_000, routeId: null, dimensionId: null })).toBe('gw-1:10000:none:none');
	});

	it('keeps rows apart inside a bucket', () => {
		expect(dimensionKey('r1', null)).toBe('r1|none');
		expect(dimensionKey(null, 'c1')).not.toBe(dimensionKey('c1', null));
	});
});
