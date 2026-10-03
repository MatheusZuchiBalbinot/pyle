import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, deleteInstance, deleteService, updateInstance, updateService } from '@/app/api/adminApiClient';
import { buildInstance, buildService } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useServiceActions } from './useServiceActions';

vi.mock('../../../api/adminApiClient', () => ({
	updateInstance: vi.fn(),
	updateService: vi.fn(),
	deleteInstance: vi.fn(),
	deleteService: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const INSTANCE = buildInstance('orders-1');
const SERVICE = buildService('orders', { name: 'Pedidos', instances: [INSTANCE] });

function render() {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	return { ...renderHook(() => useServiceActions(), { wrapper }), gateway, realtime };
}

describe('useServiceActions', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('drains an instance with an undo, warning when the service has none enabled left', async () => {
		vi.mocked(updateInstance).mockResolvedValueOnce({ instance: INSTANCE, warning: 'service-has-no-enabled-instance' });
		vi.mocked(updateInstance).mockResolvedValueOnce({ instance: INSTANCE, warning: null });
		const { result, gateway } = render();

		await act(() => result.current.drain(SERVICE, INSTANCE));

		expect(updateInstance).toHaveBeenCalledWith('orders', INSTANCE.id, { isEnabled: false });
		expect(gateway.toasts()).toEqual([
			{ message: 'services.actions.drained', tone: 'success', action: { label: 'toasts.undo', onAct: expect.any(Function) } },
			{ message: 'services.actions.noEnabledWarning', tone: 'warning' },
		]);

		await act(async () => {
			gateway.toasts()[0].action?.onAct();
		});

		await waitFor(() => expect(updateInstance).toHaveBeenLastCalledWith('orders', INSTANCE.id, { isEnabled: true }));
		expect(gateway.toasts()).toHaveLength(2);
	});

	it('changes weight and strategy quietly (the control shows it), and reports failures as toasts', async () => {
		vi.mocked(updateInstance)
			.mockResolvedValueOnce({ instance: INSTANCE, warning: null })
			.mockResolvedValueOnce({ instance: INSTANCE, warning: null })
			.mockRejectedValueOnce(new Error('network'));
		vi.mocked(updateService).mockRejectedValueOnce(new AdminApiError('bad', 400)).mockResolvedValueOnce(SERVICE);
		const { result, gateway, realtime } = render();

		await act(() => result.current.enable(SERVICE, INSTANCE));
		await act(() => result.current.setWeight(SERVICE, INSTANCE, 3));
		await act(() => result.current.setWeight(SERVICE, INSTANCE, 4));
		await act(() => result.current.setStrategy(SERVICE, 'weighted_random'));
		await act(() => result.current.setStrategy(SERVICE, 'weighted_random'));

		expect(updateInstance).toHaveBeenNthCalledWith(2, 'orders', INSTANCE.id, { weight: 3 });
		expect(updateService).toHaveBeenCalledWith('orders', { lbStrategy: 'weighted_random' });
		expect(gateway.toasts().map((toast) => toast.message)).toEqual(['services.actions.enabled', 'common.unexpectedError', 'bad']);
		expect(realtime.events()).toContainEqual(expect.objectContaining({ entity: 'Service', action: 'updated' }));
	});

	it('removes an instance after confirmation', async () => {
		vi.mocked(deleteInstance).mockResolvedValue(undefined);
		const { result, realtime } = render();

		act(() => result.current.requestRemoveInstance(SERVICE, INSTANCE));
		await act(() => result.current.confirmRemoval());

		expect(deleteInstance).toHaveBeenCalledWith('orders', INSTANCE.id);
		expect(result.current.removal).toBeNull();
		expect(realtime.events()).toContainEqual(expect.objectContaining({ entity: 'ServiceInstance', action: 'deleted' }));
	});

	it('explains a service that routes still point at, then removes it', async () => {
		vi.mocked(deleteService)
			.mockRejectedValueOnce(new AdminApiError('conflict', 409))
			.mockRejectedValueOnce(new AdminApiError('gone', 404))
			.mockResolvedValueOnce(undefined);
		const { result } = render();

		act(() => result.current.requestRemoveService(SERVICE));
		await act(() => result.current.confirmRemoval());
		expect(result.current.removal).toMatchObject({ kind: 'service', isRemoving: false, errorMessage: 'services.remove.hasRoutes' });
		await act(() => result.current.confirmRemoval());
		expect(result.current.removal?.errorMessage).toBe('gone');
		await act(() => result.current.confirmRemoval());

		expect(result.current.removal).toBeNull();
		act(() => result.current.requestRemoveService(SERVICE));
		act(() => result.current.cancelRemoval());
		await act(() => result.current.confirmRemoval());
		expect(deleteService).toHaveBeenCalledTimes(3);
	});
});
