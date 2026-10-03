import { createServer } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { extraDelayMs, NO_CHAOS, parseChaos, shouldFail } from './chaos.mjs';
import { BUILDERS, isKnownId, ITEM_COUNT, listPage } from './data.mjs';

// A demo backend for the gateway: one process per instance (orders-1,
// orders-2, ...), deterministic JSON, a little natural latency, and faults
// the console can inject. No dependencies: node:http only.
const SERVICE_NAMES = Object.keys(BUILDERS);
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_BODY_BYTES = 64 * 1024;
const JITTER_FRACTION = 0.5;
const CHAOS_PATH = '/__chaos';
const CHAOS_TOKEN_HEADER = 'x-chaos-token';
const INSTANCE_HEADER = 'x-demo-instance';
const HEALTH_PATHS = new Set(['/health', '/api/public/health']);
// Typical response times, so the charts have something to show.
const BASE_LATENCY_MS = { orders: 15, users: 8, catalog: 25 };
// Where each service lists its collection, after the gateway strips the
// route prefix (/api/orders/42 reaches orders as /42).
const COLLECTION_PATH = { orders: '/', users: '/', catalog: '/items' };

function sendJson(response, status, body, instanceId) {
	response.writeHead(status, { 'content-type': 'application/json', [INSTANCE_HEADER]: instanceId });
	response.end(JSON.stringify(body));
}

function readBody(request) {
	return new Promise((resolve, reject) => {
		const chunks = [];
		let size = 0;
		request.on('data', (chunk) => {
			size += chunk.length;
			if (size > MAX_BODY_BYTES) {
				reject(Object.assign(new Error('body too large'), { status: 413 }));
				request.destroy();
				return;
			}
			chunks.push(chunk);
		});
		request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		request.on('error', reject);
	});
}

async function readJson(request) {
	const text = await readBody(request);
	try {
		return JSON.parse(text || 'null');
	} catch {
		throw Object.assign(new Error('invalid JSON'), { status: 400 });
	}
}

// HEAD is a GET without the body (node:http drops the body by itself).
function isRead(request) {
	return request.method === 'GET' || request.method === 'HEAD';
}

function clampInteger(raw, fallback, max) {
	const value = Number.parseInt(raw ?? '', 10);
	if (!Number.isInteger(value) || value < 0) return fallback;
	return Math.min(value, max);
}

function naturalDelayMs(service, random) {
	const base = BASE_LATENCY_MS[service];
	return base + Math.round(random() * base * JITTER_FRACTION);
}

export function createDemoServer({ serviceName, instanceId, chaosToken = null, random = Math.random }) {
	if (!SERVICE_NAMES.includes(serviceName)) throw new Error(`SERVICE_NAME must be one of ${SERVICE_NAMES.join(', ')}`);
	let chaos = NO_CHAOS;
	let nextOrderId = ITEM_COUNT;
	const collectionPath = COLLECTION_PATH[serviceName];
	const itemPrefix = collectionPath === '/' ? '/' : `${collectionPath}/`;

	function send(response, status, body) {
		sendJson(response, status, { service: serviceName, instance: instanceId, ...body }, instanceId);
	}

	// Without a token, chaos does not exist (404, not 401: nothing to find).
	async function handleChaos(request, response) {
		const isAuthorized = chaosToken !== null && request.headers[CHAOS_TOKEN_HEADER] === chaosToken;
		if (!isAuthorized) return send(response, 404, { error: 'not_found' });
		if (request.method === 'GET') return send(response, 200, { chaos });
		if (request.method !== 'PUT') return send(response, 405, { error: 'method_not_allowed' });
		const parsed = parseChaos(await readJson(request));
		if (parsed === null) return send(response, 400, { error: 'invalid_chaos' });
		chaos = parsed;
		return send(response, 200, { chaos });
	}

	async function handleCollection(request, response, url) {
		if (isRead(request)) {
			const limit = clampInteger(url.searchParams.get('limit'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) || DEFAULT_PAGE_SIZE;
			const offset = clampInteger(url.searchParams.get('offset'), 0, ITEM_COUNT);
			return send(response, 200, listPage(serviceName, offset, limit));
		}
		const isOrderCreation = request.method === 'POST' && serviceName === 'orders';
		if (!isOrderCreation) return send(response, 405, { error: 'method_not_allowed' });
		const body = await readJson(request);
		nextOrderId += 1;
		return send(response, 201, { order: { ...body, id: `${instanceId}-${nextOrderId}` } });
	}

	function handleItem(request, response, rawId) {
		if (!isRead(request)) return send(response, 405, { error: 'method_not_allowed' });
		const id = Number(rawId);
		if (!isKnownId(id)) return send(response, 404, { error: 'not_found' });
		return send(response, 200, { item: BUILDERS[serviceName](id) });
	}

	async function route(request, response) {
		const url = new URL(request.url ?? '/', 'http://demo.local');
		const path = url.pathname;
		if (path === CHAOS_PATH) return handleChaos(request, response);
		if (chaos.isDown) return send(response, 503, { error: 'down' });
		if (HEALTH_PATHS.has(path)) return send(response, 200, { status: 'ok' });
		await sleep(naturalDelayMs(serviceName, random) + extraDelayMs(chaos, random));
		if (shouldFail(chaos, random)) return send(response, 500, { error: 'injected' });
		if (path === collectionPath) return handleCollection(request, response, url);
		const isItemPath = path.startsWith(itemPrefix) && path.length > itemPrefix.length && !path.slice(itemPrefix.length).includes('/');
		if (isItemPath) return handleItem(request, response, path.slice(itemPrefix.length));
		return send(response, 404, { error: 'not_found' });
	}

	return createServer((request, response) => {
		route(request, response).catch((error) => {
			if (response.headersSent) return response.destroy();
			send(response, error.status ?? 500, { error: error.message });
		});
	});
}

function startFromEnvironment() {
	const port = Number(process.env.PORT ?? 8080);
	const server = createDemoServer({
		serviceName: process.env.SERVICE_NAME,
		instanceId: process.env.INSTANCE_ID ?? `${process.env.SERVICE_NAME}-local`,
		chaosToken: process.env.CHAOS_TOKEN || null,
	});
	server.listen(port, () => console.log(`[demo] ${process.env.INSTANCE_ID} (${process.env.SERVICE_NAME}) listening on ${port}`));
	process.on('SIGTERM', () => server.close(() => process.exit(0)));
}

const isEntryPoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntryPoint) startFromEnvironment();
