import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, createInstance } from '@/app/api/adminApiClient';
import { buildInstance } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useInstanceForm } from './useInstanceForm';

vi.mock('../../../api/adminApiClient', () => ({
	createInstance: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

function render() {
	const realtime = buildRealtimeHarness();

	return { ...renderHook(() => useInstanceForm('orders'), { wrapper: realtime.wrapper }), realtime };
}

function fill(result: ReturnType<typeof render>['result']): void {
	act(() => {
		result.current.setField('name', 'orders-4');
		result.current.setField('url', 'http://localhost:48104');
	});
}

describe('useInstanceForm', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('adds an instance to the service and announces it', async () => {
		vi.mocked(createInstance).mockResolvedValue(buildInstance('orders-4'));
		const { result, realtime } = render();

		fill(result);

		await act(async () => {
			await result.current.submit();
		});

		expect(createInstance).toHaveBeenCalledWith('orders', { name: 'orders-4', url: 'http://localhost:48104', weight: 1 });
		expect(realtime.events()).toEqual([expect.objectContaining({ entity: 'ServiceInstance', action: 'created' })]);
	});

	it('puts a taken name on its field', async () => {
		vi.mocked(createInstance).mockRejectedValue(new AdminApiError('taken', 409));
		const { result } = render();

		fill(result);

		await act(async () => {
			await result.current.submit();
		});

		expect(result.current.errors.name).toBe('services.instanceForm.errors.nameTaken');
	});
});
