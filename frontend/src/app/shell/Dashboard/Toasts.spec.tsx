import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GatewayProvider } from '@/app/core/gateway/GatewayProvider';
import { useGateway } from '@/app/core/gateway/useGateway';

import { Toasts } from './Toasts';

const UNDO_TOAST_MS = 5000;

type Trigger = { readonly onUndo: () => void };

function DrainTrigger({ onUndo }: Trigger): ReactElement {
	const { toast } = useGateway();

	function handleClick(): void {
		toast('orders-1 drenada', 'success', { label: 'Desfazer', onAct: onUndo });
	}

	return (
		<button type="button" onClick={handleClick}>
			drenar
		</button>
	);
}

function renderToasts(): { readonly onUndo: () => void } {
	const onUndo = vi.fn();

	render(
		<GatewayProvider>
			<DrainTrigger onUndo={onUndo} />
			<Toasts />
		</GatewayProvider>,
	);
	fireEvent.click(screen.getByRole('button', { name: 'drenar' }));

	return { onUndo };
}

describe('Toasts', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
		window.history.replaceState(null, '', '/');
	});

	it('runs the action once and dismisses the toast', () => {
		const { onUndo } = renderToasts();

		fireEvent.click(screen.getByRole('button', { name: 'Desfazer' }));

		expect(onUndo).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();
		expect(screen.queryByText('orders-1 drenada')).toBeNull();
	});

	it('offers the action for five seconds, and a click on the message only dismisses', () => {
		const { onUndo } = renderToasts();

		act(() => vi.advanceTimersByTime(UNDO_TOAST_MS - 1));
		expect(screen.getByRole('button', { name: 'Desfazer' })).toBeTruthy();
		act(() => vi.advanceTimersByTime(1));
		expect(screen.queryByRole('button', { name: 'Desfazer' })).toBeNull();

		fireEvent.click(screen.getByRole('button', { name: 'drenar' }));
		fireEvent.click(screen.getByRole('button', { name: 'toasts.dismiss' }));

		expect(screen.queryByText('orders-1 drenada')).toBeNull();
		expect(onUndo).not.toHaveBeenCalled();
	});
});
