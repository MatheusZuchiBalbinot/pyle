import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayProvider } from './GatewayProvider';
import { useGateway } from './useGateway';

const SHORT_TOAST_MS = 3600;
const ACTION_TOAST_MS = 5000;

function wrapper({ children }: { readonly children: ReactNode }): ReactNode {
	return <GatewayProvider>{children}</GatewayProvider>;
}

describe('GatewayProvider toasts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('lets a confirmation go after a few seconds', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.toast('Rota criada', 'success'));
		act(() => vi.advanceTimersByTime(SHORT_TOAST_MS));

		expect(result.current.toasts).toEqual([]);
	});

	it('keeps a failure up long enough to be read, until it times out or is dismissed', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.toast('A IA está indisponível', 'danger'));
		act(() => vi.advanceTimersByTime(SHORT_TOAST_MS));

		expect(result.current.toasts).toHaveLength(1);

		act(() => result.current.dismissToast(result.current.toasts[0].id));

		expect(result.current.toasts).toEqual([]);
	});

	it('keeps a toast with an action up for five seconds, carrying the action', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });
		const undo = { label: 'Desfazer', onAct: vi.fn() };

		act(() => result.current.toast('orders-1 drenada', 'success', undo));
		act(() => vi.advanceTimersByTime(SHORT_TOAST_MS));

		expect(result.current.toasts).toEqual([expect.objectContaining({ message: 'orders-1 drenada', action: undo })]);

		act(() => vi.advanceTimersByTime(ACTION_TOAST_MS - SHORT_TOAST_MS));

		expect(result.current.toasts).toEqual([]);
	});

	it('marks a toast without an action as such', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.toast('Rota criada'));

		expect(result.current.toasts[0]).toMatchObject({ tone: 'default', action: null });
	});
});

describe('GatewayProvider location', () => {
	afterEach(() => {
		window.history.replaceState(null, '', '/');
	});

	function goBack(path: string): void {
		window.history.replaceState(null, '', path);
		window.dispatchEvent(new PopStateEvent('popstate'));
	}

	it('starts where the URL points, and rewrites a path it does not know', () => {
		window.history.replaceState(null, '', '/routes/r-1');
		const deepLink = renderHook(() => useGateway(), { wrapper });

		expect(deepLink.result.current.activePage).toBe('routes');
		expect(deepLink.result.current.selection).toEqual({ type: 'route', routeId: 'r-1' });

		window.history.replaceState(null, '', '/nowhere');
		const unknown = renderHook(() => useGateway(), { wrapper });

		expect(unknown.result.current.activePage).toBe('overview');
		expect(window.location.pathname).toBe('/');
	});

	it('writes every move to the URL, and follows the back button', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.openSelection({ type: 'service', serviceSlug: 'orders', instanceId: 'i-2' }));
		expect(window.location.pathname).toBe('/services/orders/instances/i-2');
		act(() => result.current.openAnalysis('a-9'));
		expect(window.location.pathname).toBe('/ai/a-9');
		expect(result.current.activePage).toBe('ai');

		act(() => goBack('/services/orders/instances/i-2'));

		expect(result.current.activePage).toBe('services');
		expect(result.current.selection).toEqual({ type: 'service', serviceSlug: 'orders', instanceId: 'i-2' });
	});

	it('returns to where a page was left from the sidebar, and a second click opens the page itself', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.openSelection({ type: 'route-traffic', routeId: 'r-1' }));
		act(() => result.current.navigate('routes'));
		act(() => result.current.navigate('traffic'));
		expect(window.location.pathname).toBe('/traffic/routes/r-1');

		act(() => result.current.navigate('traffic'));
		expect(window.location.pathname).toBe('/traffic');
		expect(result.current.selection).toBeNull();
	});

	it('closes what is open and stays on the page', () => {
		const { result } = renderHook(() => useGateway(), { wrapper });

		act(() => result.current.openSelection({ type: 'consumer', consumerSlug: 'web-app' }));
		act(() => result.current.clearSelection());

		expect(result.current.activePage).toBe('consumers');
		expect(window.location.pathname).toBe('/consumers');
	});
});
