import { describe, expect, it } from 'vitest';

import { buildTestSnapshot, TEST_CONSUMER, TEST_SERVICE } from '../testing/build-test-snapshot.js';
import { RouteTable } from './route-table.js';

describe('RouteTable', () => {
	const snapshot = buildTestSnapshot({
		routes: [
			{ id: 'root', pathPrefix: '/' },
			{ id: 'api', pathPrefix: '/api' },
			{ id: 'orders', pathPrefix: '/api/orders' },
			{ id: 'orphan', pathPrefix: '/orphan', serviceId: 'missing' },
		],
	});
	const table = new RouteTable(snapshot);

	it.each([
		['/api/orders/42', 'orders'],
		['/api/orders', 'orders'],
		['/api/ordersx', 'api'],
		['/api', 'api'],
		['/elsewhere', 'root'],
	])('matches %s to the most specific route, %s', (path, routeId) => {
		expect(table.match(path)?.route.id).toBe(routeId);
		expect(table.match(path)?.service.id).toBe(TEST_SERVICE.id);
	});

	it('drops a route whose service is not loaded', () => {
		expect(table.match('/orphan')?.route.id).toBe('root');
	});

	it('answers null when nothing matches', () => {
		expect(new RouteTable(buildTestSnapshot({ routes: [{ id: 'a', pathPrefix: '/a' }] })).match('/b')).toBeNull();
	});

	it('finds consumers by id', () => {
		expect(table.consumer(TEST_CONSUMER.id)).toEqual(TEST_CONSUMER);
		expect(table.consumer('ghost')).toBeNull();
	});
});
