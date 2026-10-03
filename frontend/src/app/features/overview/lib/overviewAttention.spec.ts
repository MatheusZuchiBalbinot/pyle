import { describe, expect, it } from 'vitest';

import type { AdminOverview, GatewayHeartbeat } from '@/app/api/adminApiTypes';
import { buildGatewayAlert, buildInstance, buildLiveState, buildService, buildTrafficTotals } from '@/test/gatewayFixtures';

import { buildAttentionItems } from './overviewAttention';

const HEARTBEAT: GatewayHeartbeat & { readonly isAlive: boolean } = {
	gatewayId: 'gw-1',
	startedAt: '',
	configVersion: 1,
	isRateLimitDegraded: false,
	updatedAt: '',
	isAlive: true,
};

function overview(overrides: Partial<AdminOverview>): AdminOverview {
	const window = { from: '', to: '', stepSeconds: 60 };

	return {
		generatedAt: '',
		systemHealth: [],
		gateway: { gateways: [HEARTBEAT], configVersion: 1 },
		traffic: { window, totals: buildTrafficTotals(), series: [], routes: [], topConsumers: [] },
		services: [],
		openAlerts: [],
		recentChanges: [],
		...overrides,
	};
}

const DOWN = buildInstance('orders-2', { live: buildLiveState({ instanceId: 'id-orders-2', health: 'unhealthy' }) });
const OPEN = buildInstance('orders-3', { live: buildLiveState({ instanceId: 'id-orders-3', circuit: 'open' }) });
const ORDERS = buildService('orders', { id: 's-orders', name: 'Pedidos', instances: [buildInstance('orders-1'), DOWN, OPEN] });
const DRAINED = buildService('users', { id: 's-users', name: 'Usuários', instances: [buildInstance('users-1', { isEnabled: false })] });

describe('buildAttentionItems', () => {
	it('is empty when everything is fine', () => {
		expect(buildAttentionItems(overview({ services: [buildService('orders')] }))).toEqual([]);
	});

	it('orders by urgency: gateway, circuits, health, critical and warning alerts, drained services, rate limiting', () => {
		const items = buildAttentionItems(
			overview({
				gateway: {
					gateways: [
						{ ...HEARTBEAT, isAlive: false },
						{ ...HEARTBEAT, gatewayId: 'gw-2', isRateLimitDegraded: true },
					],
					configVersion: 1,
				},
				services: [ORDERS, DRAINED],
				openAlerts: [
					buildGatewayAlert({ id: 'warn', severity: 'warning' }),
					buildGatewayAlert({ id: 'crit', severity: 'critical', subjectId: 'r9' }),
				],
			}),
		);

		expect(items.map((item) => item.messageKey.split('.').at(-1))).toEqual([
			'circuitOpen',
			'instanceUnhealthy',
			'route_p95_latency',
			'route_p95_latency',
			'noEnabledInstance',
			'rateLimitDegraded',
		]);
		expect(items.map((item) => item.id).slice(2, 4)).toEqual(['alert:crit', 'alert:warn']);
	});

	it('says the gateway is down when no heartbeat is alive, with nothing to open', () => {
		const [item] = buildAttentionItems(overview({ gateway: { gateways: [], configVersion: 1 } }));

		expect(item).toMatchObject({ id: 'gateway-down', tone: 'danger', selection: null });
	});

	it('opens each item where it lives', () => {
		const alerts = [
			buildGatewayAlert({ id: 'route', subjectType: 'route', subjectId: 'r1' }),
			buildGatewayAlert({ id: 'service', subjectType: 'service', subjectId: 's-orders' }),
			buildGatewayAlert({ id: 'instance', kind: 'instance_unhealthy', subjectType: 'instance', subjectId: 'id-orders-1' }),
			buildGatewayAlert({ id: 'gone', subjectType: 'service', subjectId: 's-gone' }),
			buildGatewayAlert({ id: 'gone-instance', subjectType: 'instance', subjectId: 'i-gone' }),
		];
		const items = buildAttentionItems(overview({ services: [ORDERS], openAlerts: alerts }));
		const selectionOf = (id: string) => items.find((item) => item.id === `alert:${id}`)?.selection;

		expect(items[0].selection).toEqual({ type: 'service', serviceSlug: 'orders', instanceId: 'id-orders-3' });
		expect(selectionOf('route')).toEqual({ type: 'route-traffic', routeId: 'r1' });
		expect(selectionOf('service')).toEqual({ type: 'service', serviceSlug: 'orders', instanceId: null });
		expect(selectionOf('instance')).toEqual({ type: 'service', serviceSlug: 'orders', instanceId: 'id-orders-1' });
		expect(selectionOf('gone')).toBeNull();
		expect(selectionOf('gone-instance')).toBeNull();
	});

	it('does not repeat an instance alert for an instance already listed', () => {
		const alert = buildGatewayAlert({
			id: 'dup',
			kind: 'instance_unhealthy',
			severity: 'critical',
			subjectType: 'instance',
			subjectId: 'id-orders-2',
		});
		const items = buildAttentionItems(overview({ services: [ORDERS], openAlerts: [alert] }));

		expect(items.some((item) => item.id === 'alert:dup')).toBe(false);
	});
});
