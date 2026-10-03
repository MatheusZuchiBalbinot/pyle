import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConfirmDialog, type ConfirmDialogProps } from './ConfirmDialog';

function renderDialog(overrides: Partial<ConfirmDialogProps> = {}): { onConfirm: () => void; onCancel: () => void } {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	const props: ConfirmDialogProps = {
		title: 'Remover rota',
		message: 'Isso não tem volta.',
		confirmLabel: 'Remover',
		confirmTooltip: 'Remover a rota',
		onConfirm,
		onCancel,
		...overrides,
	};

	render(<ConfirmDialog {...props} />);

	return { onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
	it('is an alert dialog named by its title', () => {
		renderDialog();

		expect(screen.getByRole('alertdialog', { name: 'Remover rota' })).toBeTruthy();
		expect(screen.getByText('Isso não tem volta.')).toBeTruthy();
	});

	it('confirms only through the confirm button', () => {
		const { onConfirm, onCancel } = renderDialog();

		fireEvent.click(screen.getByText('Isso não tem volta.'));
		expect(onCancel).not.toHaveBeenCalled();

		fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('cancels with the button, a click outside or Escape', () => {
		const { onCancel } = renderDialog();

		fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
		fireEvent.click(screen.getByRole('alertdialog').parentElement as HTMLElement);
		fireEvent.keyDown(document, { key: 'Escape' });
		fireEvent.keyDown(document, { key: 'Enter' });

		expect(onCancel).toHaveBeenCalledTimes(3);
	});

	it('locks both buttons while confirming', () => {
		renderDialog({ isConfirming: true });
		const buttons = screen.getAllByRole('button') as HTMLButtonElement[];

		expect(buttons.every((button) => button.disabled)).toBe(true);
		expect(screen.getByRole('button', { name: 'Remover' }).getAttribute('aria-busy')).toBe('true');
	});

	it('keeps confirm off until the caller is satisfied', () => {
		renderDialog({ isConfirmDisabled: true, tone: 'danger' });

		expect((screen.getByRole('button', { name: 'Remover' }) as HTMLButtonElement).disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'common.cancel' }) as HTMLButtonElement).disabled).toBe(false);
	});
});
