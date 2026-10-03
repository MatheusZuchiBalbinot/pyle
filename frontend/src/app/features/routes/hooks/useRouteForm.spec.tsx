import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, createRoute, updateRoute } from '@/app/api/adminApiClient';
import { buildRoute } from '@/test/gatewayFixtures';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { useRouteForm } from './useRouteForm';

vi.mock('../../../api/adminApiClient', () => ({
	createRoute: vi.fn(),
	updateRoute: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const ROUTE = buildRoute('/api/orders', { id: 'r1', name: 'Pedidos', service: { id: 's1', slug: 'orders', name: 'Pedidos' } });

function renderCreate() {
	const realtime = buildRealtimeHarness();

	return { ...renderHook(() => useRouteForm({ kind: 'create' }), { wrapper: realtime.wrapper }), realtime };
}

describe('useRouteForm', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('shows errors only after a first attempt, and sends nothing invalid', async () => {
		const { result } = renderCreate();

		expect(result.current.errors).toEqual({});

		let saved: unknown;

		await act(async () => {
			saved = await result.current.submit();
		});

		expect(saved).toBeNull();
		expect(result.current.errors).toMatchObject({ name: 'common.validation.required', serviceSlug: 'routes.form.errors.serviceRequired' });
		expect(createRoute).not.toHaveBeenCalled();
	});

	it('creates the route and tells the console', async () => {
		vi.mocked(createRoute).mockResolvedValue(ROUTE);
		const { result, realtime } = renderCreate();

		act(() => {
			result.current.setField('name', 'Pedidos');
			result.current.setField('pathPrefix', '/api/orders');
			result.current.setField('serviceSlug', 'orders');
		});

		await act(async () => {
			await result.current.submit();
		});

		expect(createRoute).toHaveBeenCalledWith(
			expect.objectContaining({ name: 'Pedidos', pathPrefix: '/api/orders', serviceSlug: 'orders', rateLimitPerMinute: null }),
		);
		expect(realtime.events()).toEqual([expect.objectContaining({ type: 'entity.changed', entity: 'Route', action: 'created', id: 'r1' })]);
	});

	it('sends only what changed on edit', async () => {
		vi.mocked(updateRoute).mockResolvedValue(ROUTE);
		const realtime = buildRealtimeHarness();
		const { result } = renderHook(() => useRouteForm({ kind: 'edit', route: ROUTE }), { wrapper: realtime.wrapper });

		act(() => result.current.setField('rateLimitPerMinute', '300'));

		await act(async () => {
			await result.current.submit();
		});

		expect(updateRoute).toHaveBeenCalledWith('r1', { rateLimitPerMinute: 300 });
	});

	it('puts a taken prefix on its field, and other failures in the footer', async () => {
		vi.mocked(createRoute)
			.mockRejectedValueOnce(new AdminApiError('taken', 409))
			.mockRejectedValueOnce(new AdminApiError('Service "x" not found', 404))
			.mockRejectedValueOnce(new Error('network'));
		const { result } = renderCreate();

		act(() => {
			result.current.setField('name', 'Pedidos');
			result.current.setField('serviceSlug', 'orders');
			result.current.setField('pathPrefix', '/api/orders');
		});

		await act(async () => {
			await result.current.submit();
		});
		expect(result.current.errors.pathPrefix).toBe('routes.form.errors.prefixTaken');
		act(() => result.current.setField('pathPrefix', '/api/orders2'));
		expect(result.current.errors.pathPrefix).toBeUndefined();

		await act(async () => {
			await result.current.submit();
		});
		expect(result.current.formError).toBe('Service "x" not found');
		await act(async () => {
			await result.current.submit();
		});
		expect(result.current.formError).toBe('common.unexpectedError');
		expect(result.current.isSubmitting).toBe(false);
	});
});
