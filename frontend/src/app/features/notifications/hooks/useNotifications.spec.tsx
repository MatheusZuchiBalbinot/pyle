import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildConsoleHarness } from '@/test/consoleHarness';
import { buildComponent, buildGatewayAlert, buildInstance, buildLiveState, buildService } from '@/test/gatewayFixtures';

import {
	buildNotifications,
	toNotificationSeverity,
	toNotificationTarget,
	useNotifications,
	type NotificationItem,
	type NotificationSources,
} from './useNotifications';

vi.mock('../../../api/adminApiClient', () => ({
	getSystemHealth: vi.fn(),
	listOpenAlerts: vi.fn(),
	listServices: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const { getSystemHealth, listOpenAlerts, listServices } = await import('../../../api/adminApiClient');

const NO_SOURCES: NotificationSources = { systemHealth: [], openAlerts: [], services: [], unavailableSources: [] };

const UNHEALTHY = buildInstance('orders-2', { live: buildLiveState({ instanceId: 'id-orders-2', health: 'unhealthy' }) });
const CIRCUIT_OPEN = buildInstance('orders-3', { live: buildLiveState({ instanceId: 'id-orders-3', circuit: 'open' }) });
const ORDERS = buildService('orders', { instances: [buildInstance('orders-1'), UNHEALTHY, CIRCUIT_OPEN] });

describe('buildNotifications', () => {
	it('raises each instance out of the rotation, with its service', () => {
		const items = buildNotifications({ ...NO_SOURCES, services: [ORDERS] });

		expect(items.map((item) => item.id)).toEqual(['instance:id-orders-2', 'instance:id-orders-3']);
	});

	it('raises every open alert and every component that is not up', () => {
		const alert = buildGatewayAlert();
		const down = buildComponent({ component: 'control_plane_redis', status: 'down' });
		const sources: NotificationSources = { ...NO_SOURCES, openAlerts: [alert], systemHealth: [down, buildComponent()] };

		expect(buildNotifications(sources)).toEqual([
			{ kind: 'system-component', id: 'system:control_plane_redis', component: down },
			{ kind: 'gateway-alert', id: 'alert:a1', alert },
		]);
	});

	it('says a source could not be read instead of looking clean', () => {
		const items = buildNotifications({ ...NO_SOURCES, unavailableSources: ['services'] });

		expect(items).toEqual([{ kind: 'source-unavailable', id: 'source:services', source: 'services' }]);
	});

	it('puts the most severe first, and orders the ties by id so the menu does not jump around', () => {
		const sources: NotificationSources = {
			...NO_SOURCES,
			openAlerts: [buildGatewayAlert({ id: 'b' }), buildGatewayAlert({ id: 'a' })],
			services: [ORDERS],
		};

		expect(buildNotifications(sources).map((item) => item.id)).toEqual(['instance:id-orders-2', 'instance:id-orders-3', 'alert:a', 'alert:b']);
	});
});

describe('toNotificationSeverity', () => {
	it('grades a critical alert as danger and an ordinary one as warning', () => {
		const critical: NotificationItem = { kind: 'gateway-alert', id: 'x', alert: buildGatewayAlert({ severity: 'critical' }) };
		const warning: NotificationItem = { kind: 'gateway-alert', id: 'y', alert: buildGatewayAlert() };

		expect(toNotificationSeverity(critical)).toBe('danger');
		expect(toNotificationSeverity(warning)).toBe('warning');
	});

	it('grades a degraded component below a down one', () => {
		const degraded: NotificationItem = { kind: 'system-component', id: 'x', component: buildComponent({ status: 'degraded' }) };
		const down: NotificationItem = { kind: 'system-component', id: 'y', component: buildComponent({ status: 'down' }) };

		expect(toNotificationSeverity(degraded)).toBe('warning');
		expect(toNotificationSeverity(down)).toBe('danger');
	});

	it('grades an instance out of rotation as danger and an unreadable source as warning', () => {
		expect(toNotificationSeverity({ kind: 'instance-down', id: 'x', service: ORDERS, instance: UNHEALTHY })).toBe('danger');
		expect(toNotificationSeverity({ kind: 'source-unavailable', id: 'y', source: 'alerts' })).toBe('warning');
	});
});

describe('toNotificationTarget', () => {
	it('opens the instance on the Services page', () => {
		expect(toNotificationTarget({ kind: 'instance-down', id: 'x', service: ORDERS, instance: UNHEALTHY })).toEqual({
			page: 'services',
			selection: { type: 'service', serviceSlug: 'orders', instanceId: 'id-orders-2' },
		});
	});

	it('opens a route alert on its traffic, and an instance alert on Services', () => {
		const routeAlert: NotificationItem = { kind: 'gateway-alert', id: 'x', alert: buildGatewayAlert() };
		const instanceAlert: NotificationItem = {
			kind: 'gateway-alert',
			id: 'y',
			alert: buildGatewayAlert({ subjectType: 'instance', subjectId: 'i1' }),
		};

		expect(toNotificationTarget(routeAlert)).toEqual({ page: 'traffic', selection: { type: 'route-traffic', routeId: 'r1' } });
		expect(toNotificationTarget(instanceAlert)).toEqual({ page: 'services', selection: null });
	});

	it('sends platform problems and unreadable sources to the page that shows them', () => {
		expect(toNotificationTarget({ kind: 'system-component', id: 'x', component: buildComponent() }).page).toBe('overview');
		expect(toNotificationTarget({ kind: 'source-unavailable', id: 'y', source: 'services' }).page).toBe('services');
		expect(toNotificationTarget({ kind: 'source-unavailable', id: 'z', source: 'alerts' }).page).toBe('overview');
	});
});

describe('useNotifications', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('combines every source into one list and counts the dangerous ones', async () => {
		vi.mocked(getSystemHealth).mockResolvedValue([buildComponent({ status: 'down' })]);
		vi.mocked(listOpenAlerts).mockResolvedValue([buildGatewayAlert()]);
		vi.mocked(listServices).mockResolvedValue([ORDERS]);
		const harness = buildConsoleHarness();

		const { result } = renderHook(() => useNotifications(), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.items).toHaveLength(4);
		expect(result.current.dangerCount).toBe(3);
	});

	it('still builds the list when one source fails, and says which one', async () => {
		vi.mocked(getSystemHealth).mockResolvedValue([]);
		vi.mocked(listOpenAlerts).mockRejectedValue(new Error('down'));
		vi.mocked(listServices).mockResolvedValue([ORDERS]);
		const harness = buildConsoleHarness();

		const { result } = renderHook(() => useNotifications(), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.items.map((item) => item.id)).toEqual(['instance:id-orders-2', 'instance:id-orders-3', 'source:alerts']);
	});

	it('names each unreadable source separately', async () => {
		vi.mocked(getSystemHealth).mockRejectedValue(new Error('down'));
		vi.mocked(listOpenAlerts).mockResolvedValue([]);
		vi.mocked(listServices).mockRejectedValue(new Error('down'));
		const harness = buildConsoleHarness();

		const { result } = renderHook(() => useNotifications(), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.isLoaded).toBe(true));
		expect(result.current.items.map((item) => item.id)).toEqual(['source:services', 'source:systemHealth']);
	});

	it('refetches when an instance changes state', async () => {
		vi.mocked(getSystemHealth).mockResolvedValue([]);
		vi.mocked(listOpenAlerts).mockResolvedValue([]);
		vi.mocked(listServices).mockResolvedValue([]);
		const harness = buildConsoleHarness();
		const { result } = renderHook(() => useNotifications(), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.isLoaded).toBe(true));

		harness.emit({
			type: 'instance.state.changed',
			serviceId: 's1',
			serviceSlug: 'orders',
			instanceId: 'i1',
			instanceName: 'orders-1',
			kind: 'health',
			toState: 'unhealthy',
			reason: 'r',
			occurredAt: '2026-09-25T10:00:00.000Z',
		});

		await waitFor(() => expect(listServices).toHaveBeenCalledTimes(2));
	});
});
