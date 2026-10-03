import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, createService, updateService } from '@/app/api/adminApiClient';
import { buildService } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useServiceForm, type ServiceFormMode } from './useServiceForm';

vi.mock('../../../api/adminApiClient', () => ({
	createService: vi.fn(),
	updateService: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const SERVICE = buildService('orders', { name: 'Pedidos' });

function render(mode: ServiceFormMode) {
	const realtime = buildRealtimeHarness();

	return { ...renderHook(() => useServiceForm(mode), { wrapper: realtime.wrapper }), realtime };
}

describe('useServiceForm', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('creates a service and announces it', async () => {
		vi.mocked(createService).mockResolvedValue(SERVICE);
		const { result, realtime } = render({ kind: 'create' });

		act(() => {
			result.current.setField('slug', 'orders');
			result.current.setField('name', 'Pedidos');
		});

		await act(async () => {
			await result.current.submit();
		});

		expect(createService).toHaveBeenCalledWith(expect.objectContaining({ slug: 'orders', name: 'Pedidos' }));
		expect(realtime.events()).toEqual([expect.objectContaining({ entity: 'Service', action: 'created', id: SERVICE.id })]);
	});

	it('sends only what changed on edit, never the slug', async () => {
		vi.mocked(updateService).mockResolvedValue(SERVICE);
		const { result, realtime } = render({ kind: 'edit', service: SERVICE });

		act(() => result.current.setField('timeoutMs', '2000'));

		await act(async () => {
			await result.current.submit();
		});

		expect(updateService).toHaveBeenCalledWith('orders', { timeoutMs: 2000 });
		expect(realtime.events()).toEqual([expect.objectContaining({ action: 'updated' })]);
	});

	it('puts a taken slug on its field', async () => {
		vi.mocked(createService).mockRejectedValue(new AdminApiError('taken', 409));
		const { result } = render({ kind: 'create' });

		act(() => {
			result.current.setField('slug', 'orders');
			result.current.setField('name', 'Pedidos');
		});

		await act(async () => {
			await result.current.submit();
		});

		expect(result.current.errors.slug).toBe('services.form.errors.slugTaken');
	});
});
