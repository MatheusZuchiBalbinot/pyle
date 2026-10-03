import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SelectInput, type SelectOption } from './SelectInput';

const OPTIONS: readonly SelectOption[] = [
	{ value: 'round_robin', label: 'Round-robin' },
	{ value: 'least_connections', label: 'Menos conexões' },
	{ value: 'weighted_random', label: 'Aleatório ponderado' },
];

function renderSelect(onChange = vi.fn()): { trigger: HTMLElement; onChange: ReturnType<typeof vi.fn> } {
	render(<SelectInput label="Balanceamento" options={OPTIONS} value="round_robin" onChange={onChange} />);

	return { trigger: screen.getByRole('combobox', { name: 'Balanceamento' }), onChange };
}

describe('SelectInput', () => {
	it('shows the selected label and opens a listbox with the selected option marked', () => {
		const { trigger } = renderSelect();

		expect(trigger.textContent).toBe('Round-robin');
		fireEvent.click(trigger);
		expect(trigger.getAttribute('aria-expanded')).toBe('true');
		const selected = screen.getByRole('option', { selected: true });

		expect(selected.textContent).toBe('Round-robin');
	});

	it('commits the clicked option and closes', () => {
		const { trigger, onChange } = renderSelect();

		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole('option', { name: 'Menos conexões' }));
		expect(onChange).toHaveBeenCalledWith('least_connections');
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('does not report a change when the current option is picked again', () => {
		const { trigger, onChange } = renderSelect();

		fireEvent.click(trigger);
		fireEvent.click(screen.getByRole('option', { name: 'Round-robin' }));
		expect(onChange).not.toHaveBeenCalled();
	});

	it('opens with the keyboard, moves the highlight and commits with Enter', () => {
		const { trigger, onChange } = renderSelect();

		fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		expect(screen.getByRole('listbox')).toBeTruthy();
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		fireEvent.keyDown(trigger, { key: 'ArrowDown' });
		const activeId = trigger.getAttribute('aria-activedescendant') ?? '';

		expect(document.getElementById(activeId)?.textContent).toBe('Aleatório ponderado');
		fireEvent.keyDown(trigger, { key: 'Enter' });
		expect(onChange).toHaveBeenCalledWith('weighted_random');
	});

	it('jumps by first letter', () => {
		const { trigger, onChange } = renderSelect();

		fireEvent.keyDown(trigger, { key: 'Enter' });
		fireEvent.keyDown(trigger, { key: 'a' });
		fireEvent.keyDown(trigger, { key: ' ' });
		expect(onChange).toHaveBeenCalledWith('weighted_random');
	});

	it('closes on Escape without letting it reach document listeners', () => {
		const escapesSeen: string[] = [];

		function documentListener(event: KeyboardEvent): void {
			if (event.key === 'Escape') {
				escapesSeen.push(event.key);
			}
		}

		document.addEventListener('keydown', documentListener);
		const { trigger, onChange } = renderSelect();

		fireEvent.keyDown(trigger, { key: 'Enter' });
		fireEvent.keyDown(trigger, { key: 'Escape' });
		document.removeEventListener('keydown', documentListener);
		expect(screen.queryByRole('listbox')).toBeNull();
		expect(escapesSeen).toEqual([]);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('closes on Tab and on a click outside', () => {
		const { trigger } = renderSelect();

		fireEvent.click(trigger);
		fireEvent.keyDown(trigger, { key: 'Tab' });
		expect(screen.queryByRole('listbox')).toBeNull();
		fireEvent.click(trigger);
		fireEvent.mouseDown(document.body);
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('toggles closed when the trigger is clicked again', () => {
		const { trigger } = renderSelect();

		fireEvent.click(trigger);
		fireEvent.click(trigger);
		expect(screen.queryByRole('listbox')).toBeNull();
	});

	it('ignores other keys while closed', () => {
		const { trigger } = renderSelect();

		fireEvent.keyDown(trigger, { key: 'x' });
		expect(screen.queryByRole('listbox')).toBeNull();
	});
});
