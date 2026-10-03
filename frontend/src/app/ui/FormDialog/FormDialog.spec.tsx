import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SelectInput } from '../SelectInput/SelectInput';
import { FormDialog, type FormDialogProps } from './FormDialog';

const OPTIONS = [
	{ value: 'a', label: 'A' },
	{ value: 'b', label: 'B' },
];

function renderDialog(overrides: Partial<FormDialogProps> = {}): { onSubmit: () => void; onCancel: () => void } {
	const onSubmit = vi.fn();
	const onCancel = vi.fn();
	const props: FormDialogProps = {
		title: 'Nova rota',
		submitLabel: 'Criar rota',
		submitTooltip: 'Criar',
		isSubmitting: false,
		errorMessage: null,
		onSubmit,
		onCancel,
		children: <SelectInput label="Serviço" options={OPTIONS} value="a" onChange={vi.fn()} />,
		...overrides,
	};

	render(<FormDialog {...props} />);

	return { onSubmit, onCancel };
}

describe('FormDialog', () => {
	it('submits through the form, without the browser reloading the page', () => {
		const { onSubmit } = renderDialog();
		const form = screen.getByRole('dialog', { name: 'Nova rota' });
		const submitEvent = new Event('submit', { bubbles: true, cancelable: true });

		fireEvent(form, submitEvent);

		expect(onSubmit).toHaveBeenCalledOnce();
		expect(submitEvent.defaultPrevented).toBe(true);
	});

	it('cancels on Escape and on a click outside, not on a click inside', () => {
		const { onCancel } = renderDialog();
		const form = screen.getByRole('dialog');

		fireEvent.click(form);
		expect(onCancel).not.toHaveBeenCalled();

		fireEvent.keyDown(document, { key: 'Escape' });
		fireEvent.click(form.parentElement as HTMLElement);
		expect(onCancel).toHaveBeenCalledTimes(2);
	});

	it('lets Escape close an open select without closing the dialog', () => {
		const { onCancel } = renderDialog();
		const select = screen.getByRole('combobox', { name: 'Serviço' });

		fireEvent.click(select);
		fireEvent.keyDown(select, { key: 'Escape' });

		expect(screen.queryByRole('listbox')).toBeNull();
		expect(onCancel).not.toHaveBeenCalled();
	});

	it('says it is saving and blocks both actions meanwhile, and shows a form-level error', () => {
		renderDialog({ isSubmitting: true, errorMessage: 'Prefixo em uso' });

		const submit = screen.getByRole('button', { name: 'Criar rota' }) as HTMLButtonElement;

		expect(submit.getAttribute('aria-busy')).toBe('true');
		expect(submit.disabled).toBe(true);
		expect((screen.getByRole('button', { name: 'common.cancel' }) as HTMLButtonElement).disabled).toBe(true);
		expect(screen.getByRole('alert').textContent).toBe('Prefixo em uso');
	});
});
