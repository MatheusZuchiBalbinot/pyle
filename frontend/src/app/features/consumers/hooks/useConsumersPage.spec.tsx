import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTrafficOverview, listConsumers } from '@/app/api/adminApiClient';
import type { Consumer, TrafficOverview } from '@/app/api/adminApiTypes';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { matchesConsumer, useConsumersPage } from './useConsumersPage';

vi.mock('../../../api/adminApiClient', () => ({
	listConsumers: vi.fn(),
	getTrafficOverview: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

function consumer(slug: string, name: string): Consumer {
	return { id: `id-${slug}`, slug, name, rateLimitPerMinute: 600, allowedRoutes: [], apiKeys: [], createdAt: '', updatedAt: '' };
}

const WEB = consumer('web-app', 'Web app');
const PARTNER = consumer('partner-x', 'Parceiro X');
const USAGE = {
	topConsumers: [{ consumerId: 'id-web-app', slug: 'web-app', name: 'Web app', requestCount: 900, rateLimitedCount: 3 }],
} as unknown as TrafficOverview;

function render(selection: ConsoleSelection | null = null) {
	const gateway = buildGatewayHarness({ selection });
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	return { ...renderHook(() => useConsumersPage(), { wrapper }), gateway };
}

describe('useConsumersPage', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
	});

	it('merges the busiest consumers usage into the loaded page', async () => {
		vi.mocked(listConsumers).mockResolvedValue({ items: [WEB, PARTNER], nextCursor: 'more' });
		vi.mocked(getTrafficOverview).mockResolvedValue(USAGE);
		const { result } = render();

		await waitFor(() =>
			expect(result.current.rows).toMatchObject({
				status: LOAD_STATUS.loaded,
				hasMore: true,
				items: [{ usage: { requestCount: 900 } }, { usage: null }],
			}),
		);
		act(() => result.current.loadMore());
		await waitFor(() => expect(listConsumers).toHaveBeenCalledTimes(2));
		expect(listConsumers).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'more' }));
	});

	it('filters what is loaded, once typing pauses', async () => {
		vi.mocked(listConsumers).mockResolvedValue({ items: [WEB, PARTNER], nextCursor: null });
		vi.mocked(getTrafficOverview).mockResolvedValue(USAGE);
		const { result } = render();

		await waitFor(() => expect(result.current.rows.status).toBe(LOAD_STATUS.loaded));

		act(() => result.current.setQuery('parceiro'));

		await waitFor(() => expect(result.current.rows).toMatchObject({ items: [{ consumer: { slug: 'partner-x' } }] }));
		expect(matchesConsumer(WEB, 'WEB-')).toBe(true);
		expect(matchesConsumer(WEB, '')).toBe(true);
	});

	it('opens the consumer the URL selects, and a click opens or closes one through the selection', () => {
		vi.mocked(listConsumers).mockResolvedValue({ items: [], nextCursor: null });
		vi.mocked(getTrafficOverview).mockResolvedValue(USAGE);
		const { result, gateway } = render({ type: 'consumer', consumerSlug: 'web-app' });

		expect(result.current.expandedSlug).toBe('web-app');
		act(() => result.current.toggleConsumer('partner-x'));
		expect(result.current.expandedSlug).toBe('partner-x');
		expect(gateway.selections()).toEqual([{ type: 'consumer', consumerSlug: 'partner-x' }]);
		act(() => result.current.toggleConsumer('partner-x'));
		expect(result.current.expandedSlug).toBeNull();
		expect(gateway.clearedSelectionCount()).toBe(1);
	});
});
