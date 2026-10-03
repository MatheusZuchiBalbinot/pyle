import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, deleteConsumer, getConsumerTraffic, issueApiKey, setConsumerRoutes } from '@/app/api/adminApiClient';
import type { ApiKeyCreated, Consumer, ConsumerTraffic } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useConsumerDetail } from './useConsumerDetail';

vi.mock('../../../api/adminApiClient', () => ({
	getConsumerTraffic: vi.fn(),
	issueApiKey: vi.fn(),
	revokeApiKey: vi.fn(),
	restoreApiKey: vi.fn(),
	setConsumerRoutes: vi.fn(),
	deleteConsumer: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const CONSUMER = {
	id: 'c1',
	slug: 'web-app',
	name: 'Web app',
	rateLimitPerMinute: 600,
	allowedRoutes: [],
	apiKeys: [],
	createdAt: '',
	updatedAt: '',
} as Consumer;

function render() {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	vi.mocked(getConsumerTraffic).mockResolvedValue({} as ConsumerTraffic);

	return { ...renderHook(() => useConsumerDetail(CONSUMER), { wrapper }), gateway, realtime };
}

describe('useConsumerDetail', () => {
	afterEach(() => {
		window.localStorage.clear();
		vi.clearAllMocks();
	});

	it('loads usage for the chosen window', async () => {
		const { result } = render();

		await waitFor(() => expect(result.current.traffic.status).toBe(LOAD_STATUS.loaded));

		act(() => result.current.setWindow('6h'));

		await waitFor(() => expect(getConsumerTraffic).toHaveBeenLastCalledWith('web-app', { window: '6h' }));
	});

	it('issues a key with an optional label, and says why when it cannot', async () => {
		vi.mocked(issueApiKey)
			.mockResolvedValueOnce({ id: 'k2', key: 'pyle_live_new' } as ApiKeyCreated)
			.mockResolvedValueOnce({ id: 'k3', key: 'x' } as ApiKeyCreated)
			.mockRejectedValueOnce(new AdminApiError('too many keys', 409));
		const { result, gateway } = render();

		const created = await act(() => result.current.issueKey(' mobile '));

		await act(() => result.current.issueKey(''));
		const failed = await act(() => result.current.issueKey('x'));

		expect(created?.key).toBe('pyle_live_new');
		expect(issueApiKey).toHaveBeenNthCalledWith(1, 'web-app', { label: 'mobile' });
		expect(issueApiKey).toHaveBeenNthCalledWith(2, 'web-app', {});
		expect(failed).toBeNull();
		expect(gateway.toasts()).toEqual([{ message: 'too many keys', tone: 'danger' }]);
	});

	it('sets the route access, reporting only a failure', async () => {
		vi.mocked(setConsumerRoutes).mockResolvedValueOnce(CONSUMER).mockRejectedValueOnce(new Error('network'));
		const { result, gateway } = render();

		expect(await act(() => result.current.setRoutes([]))).toBe(true);
		expect(await act(() => result.current.setRoutes(['r1']))).toBe(false);
		expect(gateway.toasts().map((toast) => toast.message)).toEqual(['common.unexpectedError']);
	});

	it('deletes the consumer after its typed confirmation, keeping the dialog on failure', async () => {
		vi.mocked(deleteConsumer).mockRejectedValueOnce(new AdminApiError('in use', 409)).mockResolvedValueOnce(undefined);
		const { result, realtime } = render();

		act(() => result.current.requestDelete());
		await act(() => result.current.confirmPending());
		expect(result.current.pending).toEqual({ isRunning: false, errorMessage: 'in use' });
		await act(() => result.current.confirmPending());
		expect(result.current.pending).toBeNull();

		expect(deleteConsumer).toHaveBeenCalledWith('web-app');
		expect(realtime.events().map((event) => (event.type === 'entity.changed' ? `${event.entity}:${event.action}` : ''))).toEqual([
			'Consumer:deleted',
		]);
		act(() => result.current.requestDelete());
		act(() => result.current.cancelPending());
		await act(() => result.current.confirmPending());
		expect(deleteConsumer).toHaveBeenCalledTimes(2);
	});
});
