import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createDemoServer } from './server.mjs';

const TOKEN = 'a-test-chaos-token-long-enough';

async function start(options) {
	const server = createDemoServer(options);
	await new Promise((resolve) => server.listen(0, resolve));
	const { port } = server.address();
	return { server, base: `http://127.0.0.1:${port}` };
}

async function json(base, path, init) {
	const response = await fetch(`${base}${path}`, init);
	return { status: response.status, instance: response.headers.get('x-demo-instance'), body: await response.json() };
}

function putChaos(base, chaos, token = TOKEN) {
	return json(base, '/__chaos', {
		method: 'PUT',
		headers: { 'content-type': 'application/json', 'x-chaos-token': token },
		body: JSON.stringify(chaos),
	});
}

describe('demo service: orders', () => {
	let context;
	before(async () => {
		context = await start({ serviceName: 'orders', instanceId: 'orders-1', chaosToken: TOKEN, random: () => 0 });
	});
	after(() => context.server.close());

	it('answers its health on both paths, tagged with the instance', async () => {
		for (const path of ['/health', '/api/public/health']) {
			const response = await json(context.base, path);
			assert.equal(response.status, 200);
			assert.equal(response.instance, 'orders-1');
			assert.deepEqual(response.body, { service: 'orders', instance: 'orders-1', status: 'ok' });
		}
	});

	it('lists a page and reads one order, the same way on every instance', async () => {
		const page = await json(context.base, '/?limit=3&offset=10');
		assert.equal(page.body.items.length, 3);
		assert.equal(page.body.items[0].id, 11);
		const one = await json(context.base, '/11');
		assert.deepEqual(one.body.item, page.body.items[0]);
	});

	it('caps the page size and ignores garbage paging', async () => {
		assert.equal((await json(context.base, '/?limit=5000')).body.items.length, 100);
		assert.equal((await json(context.base, '/?limit=abc&offset=-3')).body.items.length, 20);
	});

	it('answers 404 for unknown ids and paths, and 405 for writes on an item', async () => {
		assert.equal((await json(context.base, '/9999')).status, 404);
		assert.equal((await json(context.base, '/1/extra')).status, 404);
		assert.equal((await json(context.base, '/1', { method: 'DELETE' })).status, 405);
		assert.equal((await json(context.base, '/', { method: 'PUT' })).status, 405);
	});

	it('creates an order from a JSON body', async () => {
		const created = await json(context.base, '/', { method: 'POST', body: JSON.stringify({ total: 10 }) });
		assert.equal(created.status, 201);
		assert.match(created.body.order.id, /^orders-1-\d+$/);
		assert.equal(created.body.order.total, 10);
	});

	it('refuses invalid JSON and bodies that are too large', async () => {
		assert.equal((await json(context.base, '/', { method: 'POST', body: '{nope' })).status, 400);
		const big = 'x'.repeat(70 * 1024);
		const response = await fetch(`${context.base}/`, { method: 'POST', body: JSON.stringify({ big }) }).catch(() => null);
		assert.ok(response === null || response.status === 413);
	});

	it('hides chaos without the token', async () => {
		assert.equal((await json(context.base, '/__chaos')).status, 404);
		assert.equal((await putChaos(context.base, { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: true }, 'wrong')).status, 404);
	});

	it('reads, validates and applies chaos with the token', async () => {
		const read = await json(context.base, '/__chaos', { headers: { 'x-chaos-token': TOKEN } });
		assert.deepEqual(read.body.chaos, { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false });
		assert.equal((await putChaos(context.base, { latencyMs: -1, jitterMs: 0, errorRate: 0, isDown: false })).status, 400);
		assert.equal((await json(context.base, '/__chaos', { method: 'POST', headers: { 'x-chaos-token': TOKEN } })).status, 405);

		await putChaos(context.base, { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: true });
		assert.equal((await json(context.base, '/health')).status, 503);
		assert.equal((await json(context.base, '/1')).status, 503);

		await putChaos(context.base, { latencyMs: 0, jitterMs: 0, errorRate: 1, isDown: false });
		assert.equal((await json(context.base, '/health')).status, 200);
		assert.deepEqual((await json(context.base, '/1')).body.error, 'injected');

		await putChaos(context.base, { latencyMs: 120, jitterMs: 0, errorRate: 0, isDown: false });
		const startedAt = Date.now();
		await json(context.base, '/1');
		assert.ok(Date.now() - startedAt >= 120);

		await putChaos(context.base, { latencyMs: 0, jitterMs: 0, errorRate: 0, isDown: false });
	});
});

describe('demo service: catalog and users', () => {
	let catalog;
	let users;
	before(async () => {
		catalog = await start({ serviceName: 'catalog', instanceId: 'catalog-1' });
		users = await start({ serviceName: 'users', instanceId: 'users-1' });
	});
	after(() => {
		catalog.server.close();
		users.server.close();
	});

	it('serves the catalog under /items', async () => {
		assert.equal((await json(catalog.base, '/items?limit=2')).body.items.length, 2);
		assert.match((await json(catalog.base, '/items/7')).body.item.sku, /^SKU-0007$/);
		assert.equal((await json(catalog.base, '/')).status, 404);
	});

	it('answers HEAD like GET, without a body', async () => {
		for (const path of ['/items', '/items/7']) {
			const response = await fetch(`${catalog.base}${path}`, { method: 'HEAD' });
			assert.equal(response.status, 200);
			assert.equal(await response.text(), '');
		}
	});

	it('serves users, and only orders can be created', async () => {
		assert.match((await json(users.base, '/5')).body.item.email, /@example\.com$/);
		assert.equal((await json(users.base, '/', { method: 'POST', body: '{}' })).status, 405);
	});

	it('refuses an unknown service at startup', () => {
		assert.throws(() => createDemoServer({ serviceName: 'payments', instanceId: 'x' }), /SERVICE_NAME/);
	});
});
