import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TypedConfirmDialog } from './TypedConfirmDialog';

function renderDialog(errorMessage: string | null = null): { onConfirm: () => void; confirm: HTMLButtonElement; input: HTMLInputElement } {
	const onConfirm = vi.fn();

	render(
		<TypedConfirmDialog
			title="Remover serviço"
			message="As instâncias saem junto."
			expected="orders"
			confirmLabel="Remover"
			confirmTooltip="Remover o serviço"
			isConfirming={false}
			errorMessage={errorMessage}
			onConfirm={onConfirm}
			onCancel={vi.fn()}
		/>,
	);

	return {
		onConfirm,
		confirm: screen.getByRole('button', { name: 'Remover' }) as HTMLButtonElement,
		input: screen.getByRole('textbox') as HTMLInputElement,
	};
}

describe('TypedConfirmDialog', () => {
	it('enables confirm only once the expected text is typed, ignoring surrounding spaces', () => {
		const { onConfirm, confirm, input } = renderDialog();

		expect(confirm.disabled).toBe(true);

		fireEvent.change(input, { target: { value: 'order' } });
		expect(confirm.disabled).toBe(true);

		fireEvent.change(input, { target: { value: ' orders ' } });
		expect(confirm.disabled).toBe(false);

		fireEvent.click(confirm);
		expect(onConfirm).toHaveBeenCalledOnce();
	});

	it('shows why the last attempt failed', () => {
		renderDialog('O serviço ainda tem rotas.');

		expect(screen.getByRole('alert').textContent).toBe('O serviço ainda tem rotas.');
	});
});
