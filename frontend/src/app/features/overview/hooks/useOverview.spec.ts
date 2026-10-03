import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getAdminOverview } from '@/app/api/adminApiClient';
import type { AdminOverview } from '@/app/api/adminApiTypes';
import { stampLocalEvent, type RealtimeEventBody } from '@/app/api/realtimeEvents';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { isOverviewChange, useOverview } from './useOverview';

vi.mock('../../../api/adminApiClient', () => ({ getAdminOverview: vi.fn(), AdminApiError: class AdminApiError extends Error {} }));

const REFETCHING: readonly RealtimeEventBody[] = [
	{
		type: 'instance.state.changed',
		serviceId: 's',
		serviceSlug: 'orders',
		instanceId: 'i',
		instanceName: 'orders-1',
		kind: 'health',
		toState: 'unhealthy',
		reason: 'x',
	},
	{ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' },
	{ type: 'alert.resolved', alertId: 'a', kind: 'circuit_open', subjectType: 'instance', subjectId: 'i', subjectName: 'orders/orders-1' },
	{ type: 'config.changed', entityType: 'route', entityId: 'r', action: 'updated', summary: 'x', detail: { kind: 'created' } },
	{ type: 'entity.changed', entity: 'ServiceInstance', action: 'updated', id: 'i' },
];

const IGNORED: readonly RealtimeEventBody[] = [
	{ type: 'entity.changed', entity: 'AdminNotification', action: 'created', id: 'n' },
	{ type: 'traffic.collected', bucketStart: '', routeIds: [], bucketMs: 10_000 },
];

describe('useOverview', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('knows which events change the Overview', () => {
		expect(REFETCHING.every((body) => isOverviewChange(stampLocalEvent(body)))).toBe(true);
		expect(IGNORED.some((body) => isOverviewChange(stampLocalEvent(body)))).toBe(false);
	});

	it('loads the overview and refetches on a state change', async () => {
		vi.mocked(getAdminOverview).mockResolvedValue({ generatedAt: 'x' } as AdminOverview);
		const harness = buildRealtimeHarness();
		const { result } = renderHook(() => useOverview(), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		act(() => harness.emit(stampLocalEvent(REFETCHING[0])));

		await waitFor(() => expect(getAdminOverview).toHaveBeenCalledTimes(2));
	});
});
