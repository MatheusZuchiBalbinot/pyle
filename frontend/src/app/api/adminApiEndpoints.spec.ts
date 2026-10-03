import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setCurrentSession, setRefreshHandler } from './accessTokenStore';
import * as client from './adminApiClient';

// A typo in a URL compiles fine and 404s at runtime; this table catches it.
const API_BASE_URL = 'http://localhost:3000';

type EndpointCase = {
	readonly name: string;
	readonly call: () => Promise<unknown>;
	readonly path: string;
	readonly method?: string;
	readonly body?: string;
};

const CHAOS = { latencyMs: 800, jitterMs: 0, errorRate: 0, isDown: false };

const ENDPOINT_CASES: readonly EndpointCase[] = [
	{ name: 'lists services', call: () => client.listServices(), path: '/admin/services' },
	{
		name: 'creates a service',
		call: () => client.createService({ slug: 'orders', name: 'Pedidos' }),
		path: '/admin/services',
		method: 'POST',
		body: JSON.stringify({ slug: 'orders', name: 'Pedidos' }),
	},
	{
		name: 'updates a service',
		call: () => client.updateService('orders', { lbStrategy: 'least_connections' }),
		path: '/admin/services/orders',
		method: 'PATCH',
		body: JSON.stringify({ lbStrategy: 'least_connections' }),
	},
	{ name: 'deletes a service', call: () => client.deleteService('orders'), path: '/admin/services/orders', method: 'DELETE' },
	{
		name: 'adds an instance',
		call: () => client.createInstance('orders', { name: 'orders-4', url: 'http://localhost:48104' }),
		path: '/admin/services/orders/instances',
		method: 'POST',
	},
	{
		name: 'updates an instance',
		call: () => client.updateInstance('orders', 'i1', { isEnabled: false }),
		path: '/admin/services/orders/instances/i1',
		method: 'PATCH',
		body: JSON.stringify({ isEnabled: false }),
	},
	{ name: 'removes an instance', call: () => client.deleteInstance('orders', 'i1'), path: '/admin/services/orders/instances/i1', method: 'DELETE' },
	{
		name: 'injects chaos',
		call: () => client.setInstanceChaos('orders', 'i1', CHAOS),
		path: '/admin/services/orders/instances/i1/chaos',
		method: 'PUT',
		body: JSON.stringify(CHAOS),
	},
	{
		name: 'clears chaos',
		call: () => client.clearInstanceChaos('orders', 'i1'),
		path: '/admin/services/orders/instances/i1/chaos',
		method: 'DELETE',
	},
	{ name: 'lists routes', call: () => client.listRoutes(), path: '/admin/routes' },
	{
		name: 'creates a route',
		call: () => client.createRoute({ name: 'Pedidos', pathPrefix: '/api/orders', serviceSlug: 'orders' }),
		path: '/admin/routes',
		method: 'POST',
	},
	{ name: 'updates a route', call: () => client.updateRoute('r1', { timeoutMs: 2000 }), path: '/admin/routes/r1', method: 'PATCH' },
	{ name: 'deletes a route', call: () => client.deleteRoute('r1'), path: '/admin/routes/r1', method: 'DELETE' },
	{ name: 'lists consumers', call: () => client.listConsumers({ cursor: 'c', limit: 20 }), path: '/admin/consumers?cursor=c&limit=20' },
	{ name: 'creates a consumer', call: () => client.createConsumer({ slug: 'web-app', name: 'Web app' }), path: '/admin/consumers', method: 'POST' },
	{
		name: 'updates a consumer',
		call: () => client.updateConsumer('web-app', { rateLimitPerMinute: 100 }),
		path: '/admin/consumers/web-app',
		method: 'PATCH',
	},
	{ name: 'deletes a consumer', call: () => client.deleteConsumer('web-app'), path: '/admin/consumers/web-app', method: 'DELETE' },
	{
		name: 'issues a key',
		call: () => client.issueApiKey('web-app', { label: 'ci' }),
		path: '/admin/consumers/web-app/keys',
		method: 'POST',
		body: JSON.stringify({ label: 'ci' }),
	},
	{ name: 'revokes a key', call: () => client.revokeApiKey('web-app', 'k1'), path: '/admin/consumers/web-app/keys/k1', method: 'DELETE' },
	{
		name: 'scopes a consumer to routes',
		call: () => client.setConsumerRoutes('web-app', ['r1']),
		path: '/admin/consumers/web-app/routes',
		method: 'PUT',
		body: JSON.stringify({ routeIds: ['r1'] }),
	},
	{ name: 'reads the traffic overview', call: () => client.getTrafficOverview({ window: '1h' }), path: '/admin/traffic/overview?window=1h' },
	{
		name: 'reads a route traffic over a period',
		call: () => client.getRouteTraffic('r1', { from: '2026-09-25T10:00:00.000Z', to: '2026-09-25T11:00:00.000Z' }),
		path: '/admin/traffic/routes/r1?from=2026-09-25T10%3A00%3A00.000Z&to=2026-09-25T11%3A00%3A00.000Z',
	},
	{
		name: 'reads a service traffic',
		call: () => client.getServiceTraffic('orders', { window: '15m' }),
		path: '/admin/traffic/services/orders?window=15m',
	},
	{
		name: 'reads a consumer traffic',
		call: () => client.getConsumerTraffic('web-app', { window: '24h' }),
		path: '/admin/traffic/consumers/web-app?window=24h',
	},
	{
		name: 'reads the request log with filters',
		call: () => client.listRequestLog({ routeId: 'r1', consumerId: 'c1', instanceId: 'i1', statusClass: '5xx' }, { limit: 50 }),
		path: '/admin/traffic/requests?routeId=r1&consumerId=c1&instanceId=i1&statusClass=5xx&limit=50',
	},
	{ name: 'reads the request log unfiltered', call: () => client.listRequestLog({}), path: '/admin/traffic/requests' },
	{ name: 'lists every open alert', call: () => client.listOpenAlerts(), path: '/admin/alerts/open' },
	{
		name: 'lists the configuration activity',
		call: () => client.listConfigActivity({ entityType: 'instance', entityId: 'i1' }),
		path: '/admin/activity?entityType=instance&entityId=i1',
	},
	{ name: 'reads the platform settings', call: () => client.getPlatformSettings(), path: '/admin/settings/platform' },
	{ name: 'reads the alert rules', call: () => client.getAlertRules(), path: '/admin/alert-rules' },
	{
		name: 'updates an alert rule',
		call: () => client.updateAlertRule('route_p95_latency', { isEnabled: true, threshold: 800, sustainedWindows: 3 }),
		path: '/admin/alert-rules/route_p95_latency',
		method: 'PUT',
		body: JSON.stringify({ isEnabled: true, threshold: 800, sustainedWindows: 3 }),
	},
	{ name: 'reads the system health', call: () => client.getSystemHealth(), path: '/admin/system/health' },
	{ name: 'reads the overview', call: () => client.getAdminOverview(), path: '/admin/overview' },
	{ name: 'reads the analyses summary', call: () => client.getAiAnalysisSummary(), path: '/admin/ai/analyses/summary' },
	{
		name: 'lists analyses of one subject',
		call: () => client.listAiAnalyses({ scope: 'route', subjectId: 'r1' }, { limit: 5 }),
		path: '/admin/ai/analyses?scope=route&subjectId=r1&limit=5',
	},
	{ name: 'lists an analysis messages', call: () => client.listAiAnalysisMessages('a1'), path: '/admin/ai/analyses/a1/messages' },
	{
		name: 'sends an assistant turn',
		call: () => client.sendAssistantTurn({ messages: [{ role: 'user', content: 'oi' }], timeZone: 'UTC' }),
		path: '/admin/ai/assistant/messages',
		method: 'POST',
		body: JSON.stringify({ messages: [{ role: 'user', content: 'oi' }], timeZone: 'UTC' }),
	},
	{
		name: 'generates an analysis',
		call: () => client.generateAiAnalysis({ scope: 'platform' }),
		path: '/admin/ai/analyses',
		method: 'POST',
	},
	{ name: 'marks a notification read', call: () => client.markNotificationRead('n1', true), path: '/admin/notifications/n1/read', method: 'POST' },
	{
		name: 'marks a notification unread',
		call: () => client.markNotificationRead('n1', false),
		path: '/admin/notifications/n1/unread',
		method: 'POST',
	},
	{ name: 'marks every notification read', call: () => client.markAllNotificationsRead(), path: '/admin/notifications/read-all', method: 'POST' },
	{ name: 'mints a realtime connection', call: () => client.mintRealtimeConnection(), path: '/admin/realtime/token', method: 'POST' },
];

describe('adminApiClient endpoints', () => {
	let fetchStub: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		setCurrentSession({
			accessToken: 'token',
			expiresAt: '2026-03-01T10:15:00.000Z',
			user: { id: 'u1', email: 'o@p.local', name: 'O', lastLoginAt: null },
		});
		setRefreshHandler(null);
		fetchStub = vi
			.fn()
			.mockResolvedValue({ ok: true, status: 200, statusText: 'OK', headers: new Headers(), json: () => Promise.resolve({}) } as Response);
		globalThis.fetch = fetchStub as unknown as typeof fetch;
	});

	afterEach(() => {
		setCurrentSession(null);
		vi.restoreAllMocks();
	});

	it.each(ENDPOINT_CASES)('$name', async ({ call, path, method, body }) => {
		await call();

		const [url, init] = fetchStub.mock.calls[0] as [string, RequestInit];

		expect(url).toBe(`${API_BASE_URL}${path}`);
		expect(init.method ?? 'GET').toBe(method ?? 'GET');

		if (body !== undefined) {
			expect(init.body).toBe(body);
		}
	});
});
