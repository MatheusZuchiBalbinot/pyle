import { describe, expect, it, vi } from 'vitest';

import { SeedAdminApiClient, SeedAdminApiError, type FetchFunction } from './seed-admin-api.client.js';

function respond(status: number, body?: unknown): Response {
	return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

function build(...responses: Response[]) {
	const fetch = vi.fn<FetchFunction>();

	for (const response of responses) {
		fetch.mockResolvedValueOnce(response);
	}

	return { client: new SeedAdminApiClient({ baseUrl: 'http://cp', token: 't0ken', fetch }), fetch };
}

describe('SeedAdminApiClient', () => {
	it('sends the token and JSON bodies, and reads JSON back', async () => {
		const { client, fetch } = build(respond(201, { id: 's1', slug: 'orders' }));

		const created = await client.createService({
			slug: 'orders',
			name: 'Pedidos',
			description: 'x',
			lbStrategy: 'round_robin',
			scalingProfile: 'demo_orders',
		});

		expect(created).toEqual({ id: 's1', slug: 'orders' });
		const [url, init] = fetch.mock.calls[0];

		expect(url).toBe('http://cp/admin/services');
		expect(init).toMatchObject({ method: 'POST', headers: { authorization: 'Bearer t0ken', 'content-type': 'application/json' } });
	});

	it('reads a missing service or consumer as null', async () => {
		const { client } = build(respond(404, { message: 'nope' }), respond(404));

		expect(await client.getService('ghost')).toBeNull();
		expect(await client.getConsumer('ghost')).toBeNull();
	});

	it('fails with the status and body of any other error', async () => {
		const { client } = build(respond(409, { message: 'taken' }), respond(500));

		await expect(
			client.createRoute({
				name: 'x',
				pathPrefix: '/x',
				serviceSlug: 's',
				isAuthRequired: true,
				rateLimitPerMinute: null,
				methods: [],
				stripPrefix: true,
			}),
		).rejects.toThrow('POST /admin/routes answered 409: {"message":"taken"}');
		await expect(client.getService('orders')).rejects.toThrow(SeedAdminApiError);
	});

	it('covers the rest of the calls it makes', async () => {
		const { client, fetch } = build(
			respond(200, []),
			respond(201, {}),
			respond(201, { key: 'k' }),
			respond(201, { key: 'k2' }),
			respond(204),
			respond(200, { slug: 'web' }),
			respond(200, []),
			respond(200, {}),
			respond(204),
			respond(204),
			respond(204),
			respond(204),
		);

		await client.listRoutes();
		await client.addInstance('orders', { name: 'orders-1', url: 'http://x', weight: 1 });
		await client.createConsumer({ slug: 'web', name: 'Web', rateLimitPerMinute: 1, routeIds: [] });
		await client.issueKey('web', 'second');
		await client.revokeKey('web', 'k1');
		await client.getConsumer('web');
		await client.listServices();
		await client.setChaos('orders', 'i1', { latencyMs: 1500, jitterMs: 0, errorRate: 0, isDown: false });
		await client.clearChaos('orders', 'i1');
		await client.deleteRoute('r1');
		await client.deleteService('bench');
		await client.deleteConsumer('bench');

		expect(fetch.mock.calls.map(([url, init]) => `${init?.method} ${(url as string).replace('http://cp', '')}`)).toEqual([
			'GET /admin/routes',
			'POST /admin/services/orders/instances',
			'POST /admin/consumers',
			'POST /admin/consumers/web/keys',
			'DELETE /admin/consumers/web/keys/k1',
			'GET /admin/consumers/web',
			'GET /admin/services',
			'PUT /admin/services/orders/instances/i1/chaos',
			'DELETE /admin/services/orders/instances/i1/chaos',
			'DELETE /admin/routes/r1',
			'DELETE /admin/services/bench',
			'DELETE /admin/consumers/bench',
		]);
	});
});
