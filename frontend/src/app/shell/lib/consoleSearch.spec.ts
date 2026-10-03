import { describe, expect, it } from 'vitest';

import type { Consumer } from '@/app/api/adminApiTypes';
import { buildInstance, buildRoute, buildService } from '@/test/gatewayFixtures';

import { MAX_SEARCH_RESULTS, normalizeForSearch, searchConsole, type SearchCatalog } from './consoleSearch';

const CONSUMER = { id: 'c1', slug: 'mobile-app', name: 'App mobile' } as Consumer;

const CATALOG: SearchCatalog = {
	services: [buildService('users', { name: 'Usuários', instances: [buildInstance('users-1'), buildInstance('users-2')] })],
	routes: [buildRoute('/api/users', { id: 'r-users', name: 'Usuários' }), buildRoute('/api/orders', { id: 'r-orders', name: 'Pedidos' })],
	consumers: [CONSUMER],
};

describe('searchConsole', () => {
	it('finds every kind of entity, ignoring case and accents, starts of names first', () => {
		const results = searchConsole('USUARIO', CATALOG);

		expect(results.map((result) => [result.kind, result.title])).toEqual([
			['route', 'Usuários'],
			['service', 'Usuários'],
		]);
	});

	it('opens each result where it lives', () => {
		const [instance] = searchConsole('users-2', CATALOG);
		const [consumer] = searchConsole('mobile', CATALOG);
		const [route] = searchConsole('/api/ord', CATALOG);

		expect(instance.selection).toEqual({ type: 'service', serviceSlug: 'users', instanceId: 'id-users-2' });
		expect(consumer.selection).toEqual({ type: 'consumer', consumerSlug: 'mobile-app' });
		expect(route.selection).toEqual({ type: 'route', routeId: 'r-orders' });
	});

	it('puts matches inside a name after matches at its start', () => {
		const results = searchConsole('app', CATALOG);

		expect(results[0]).toMatchObject({ kind: 'consumer', title: 'App mobile' });
	});

	it('finds nothing for an empty query, and caps the list', () => {
		const many: SearchCatalog = {
			...CATALOG,
			routes: Array.from({ length: 30 }, (_value, index) => buildRoute(`/api/r${index}`, { id: `r${index}`, name: `Rota ${index}` })),
		};

		expect(searchConsole('   ', CATALOG)).toEqual([]);
		expect(searchConsole('rota', many)).toHaveLength(MAX_SEARCH_RESULTS);
		expect(normalizeForSearch(' Catálogo ')).toBe('catalogo');
	});
});
