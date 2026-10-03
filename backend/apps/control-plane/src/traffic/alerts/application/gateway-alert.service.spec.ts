import type { GatewayAlert } from '@prisma/control-plane-client';
import { describe, expect, it, vi } from 'vitest';

import type { InstanceLiveStateReader } from '../../../gateway-config/infrastructure/instance-live-state.reader.js';
import type { RouteRepository } from '../../../gateway-config/infrastructure/route.repository.js';
import type { ServiceRepository } from '../../../gateway-config/infrastructure/service.repository.js';
import { buildRealtimePublisherFake } from '../../../realtime/application/realtime-publisher.fake.js';
import type { TrafficNamesRepository } from '../../infrastructure/traffic-names.repository.js';
import type { TrafficSampleRepository } from '../../infrastructure/traffic-sample.repository.js';
import { DEFAULT_ALERT_RULES } from '../domain/alert-rule-kinds.js';
import type { GatewayAlertRepository } from '../infrastructure/gateway-alert.repository.js';
import type { AlertRuleConfigService } from './alert-rule-config.service.js';
import { GatewayAlertService, type InstanceStateChange } from './gateway-alert.service.js';

const NOW = Date.parse('2026-09-26T12:00:00.000Z');
const OPEN_ALERT: GatewayAlert = {
	id: 'a1',
	kind: 'instance_unhealthy',
	severity: 'critical',
	subjectType: 'instance',
	subjectId: 'i1',
	message: 'down',
	triggeredAt: new Date(NOW - 60_000),
	resolvedAt: null,
};
const UNHEALTHY: InstanceStateChange = {
	instanceId: 'i1',
	instanceName: 'orders/orders-1',
	kind: 'health',
	toState: 'unhealthy',
	reason: '3 consecutive failed health checks (HTTP 503)',
};

function build(options: { readonly openAlerts?: readonly GatewayAlert[]; readonly isRuleEnabled?: boolean } = {}) {
	const rules = {
		...DEFAULT_ALERT_RULES,
		instance_unhealthy: { ...DEFAULT_ALERT_RULES.instance_unhealthy, isEnabled: options.isRuleEnabled ?? true },
	};
	const alerts = {
		listOpen: vi.fn().mockResolvedValue(options.openAlerts ?? []),
		listPage: vi.fn().mockResolvedValue({ items: options.openAlerts ?? [], nextCursor: null }),
		openIfNone: vi.fn(async () => ({ ...OPEN_ALERT, id: 'new' })),
		resolve: vi.fn().mockResolvedValue(true),
	};
	const names = {
		routes: vi.fn().mockResolvedValue(new Map([['r1', { id: 'r1', name: 'Pedidos', pathPrefix: '/api/orders' }]])),
		services: vi.fn().mockResolvedValue(new Map([['s1', { id: 's1', slug: 'orders', name: 'Pedidos' }]])),
		instances: vi.fn().mockResolvedValue(new Map([['i1', { id: 'i1', name: 'orders-1', serviceId: 's1', serviceSlug: 'orders' }]])),
	};
	const realtime = buildRealtimePublisherFake();
	const service = new GatewayAlertService(
		alerts as unknown as GatewayAlertRepository,
		{ rules: vi.fn().mockResolvedValue(rules) } as unknown as AlertRuleConfigService,
		{ aggregateInstanceSamples: vi.fn().mockResolvedValue([]) } as unknown as TrafficSampleRepository,
		{ listActive: vi.fn().mockResolvedValue([]) } as unknown as RouteRepository,
		{ listActive: vi.fn().mockResolvedValue([]) } as unknown as ServiceRepository,
		{ readAll: vi.fn().mockResolvedValue(new Map()) } as unknown as InstanceLiveStateReader,
		names as unknown as TrafficNamesRepository,
		realtime,
	);

	return { service, alerts, realtime };
}

describe('GatewayAlertService.onInstanceStateChanged', () => {
	it('opens an alert with the reason and announces it', async () => {
		const { service, alerts, realtime } = build();

		await service.onInstanceStateChanged(UNHEALTHY, NOW);

		expect(alerts.openIfNone).toHaveBeenCalledWith(
			expect.objectContaining({
				kind: 'instance_unhealthy',
				severity: 'critical',
				subjectId: 'i1',
				message: `Instance orders/orders-1 is failing its health checks: ${UNHEALTHY.reason}`,
			}),
			new Date(NOW),
		);
		expect(realtime.publishToAdmins).toHaveBeenCalledWith(
			expect.objectContaining({ type: 'alert.triggered', alertId: 'new', subjectName: 'orders/orders-1' }),
		);
	});

	it('stays quiet when the alert was open already', async () => {
		const { service, alerts, realtime } = build();

		alerts.openIfNone.mockResolvedValue(null as never);

		await service.onInstanceStateChanged({ ...UNHEALTHY, kind: 'circuit', toState: 'circuit_open' }, NOW);

		expect(alerts.openIfNone).toHaveBeenCalledWith(expect.objectContaining({ kind: 'circuit_open', severity: 'warning' }), new Date(NOW));
		expect(realtime.publishToAdmins).not.toHaveBeenCalled();
	});

	it('resolves the open alert once the instance recovers, with its name', async () => {
		const { service, alerts, realtime } = build({ openAlerts: [OPEN_ALERT] });

		await service.onInstanceStateChanged({ ...UNHEALTHY, toState: 'healthy' }, NOW);

		expect(alerts.resolve).toHaveBeenCalledWith('a1', new Date(NOW));
		expect(realtime.publishToAdmins).toHaveBeenCalledWith({
			type: 'alert.resolved',
			alertId: 'a1',
			kind: 'instance_unhealthy',
			subjectType: 'instance',
			subjectId: 'i1',
			subjectName: 'orders/orders-1',
		});
	});

	it('does nothing for a disabled rule, a half-open circuit, or an alert someone else resolved', async () => {
		const disabled = build({ isRuleEnabled: false });

		await disabled.service.onInstanceStateChanged(UNHEALTHY, NOW);
		expect(disabled.alerts.openIfNone).not.toHaveBeenCalled();

		const probing = build();

		await probing.service.onInstanceStateChanged({ ...UNHEALTHY, kind: 'circuit', toState: 'circuit_half_open' }, NOW);
		expect(probing.alerts.listOpen).not.toHaveBeenCalled();

		const raced = build({ openAlerts: [OPEN_ALERT] });

		raced.alerts.resolve.mockResolvedValue(false);
		await raced.service.onInstanceStateChanged({ ...UNHEALTHY, toState: 'healthy' }, NOW);
		expect(raced.realtime.publishToAdmins).not.toHaveBeenCalled();

		const nothingOpen = build();

		await nothingOpen.service.onInstanceStateChanged({ ...UNHEALTHY, toState: 'healthy' }, NOW);
		expect(nothingOpen.alerts.resolve).not.toHaveBeenCalled();
	});
});

describe('GatewayAlertService listing', () => {
	it('names every kind of subject, removed ones included', async () => {
		const alerts: GatewayAlert[] = [
			{ ...OPEN_ALERT, id: 'a-route', kind: 'route_p95_latency', subjectType: 'route', subjectId: 'r1' },
			{ ...OPEN_ALERT, id: 'a-service', subjectType: 'service', subjectId: 's1' },
			OPEN_ALERT,
			{ ...OPEN_ALERT, id: 'a-gone', subjectId: 'purged' },
			{ ...OPEN_ALERT, id: 'a-gone-route', subjectType: 'route', subjectId: 'purged' },
			{ ...OPEN_ALERT, id: 'a-gone-service', subjectType: 'service', subjectId: 'purged' },
		];
		const { service } = build({ openAlerts: alerts });

		const open = await service.listOpen();
		const history = await service.listHistory({ cursor: null, limit: 10 });

		expect(open.map((alert) => alert.subjectName)).toEqual(['Pedidos', 'Pedidos', 'orders/orders-1', '(removed)', '(removed)', '(removed)']);
		expect(history.items.map((alert) => alert.id)).toEqual(alerts.map((alert) => alert.id));
	});

	it('evaluates with nothing to do', async () => {
		const { service } = build();

		expect(await service.evaluate(NOW)).toEqual({ openedCount: 0, resolvedCount: 0 });
	});
});
