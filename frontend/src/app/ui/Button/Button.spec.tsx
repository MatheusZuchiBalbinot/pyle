import { render, screen } from '@testing-library/react';
import { Plus } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Button } from './Button';

describe('Button', () => {
	it('renders its label bare when idle, with the variant classes', () => {
		render(
			<Button variant="primary" isSmall>
				Salvar
			</Button>,
		);
		const button = screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement;

		expect(button.className).toBe('btn btn-primary btn-sm');
		expect(button.disabled).toBe(false);
		expect(button.getAttribute('aria-busy')).toBeNull();
		expect(button.querySelector('.btn-spinner')).toBeNull();
	});

	it('swaps the icon for a spinner while pending, keeping the icon laid out and the label named', () => {
		render(
			<Button icon={<Plus size={14} aria-hidden="true" data-testid="icon" />} isPending>
				Criar
			</Button>,
		);
		const button = screen.getByRole('button', { name: 'Criar' }) as HTMLButtonElement;
		const slot = button.querySelector('.btn-icon-slot');

		expect(button.disabled).toBe(true);
		expect(button.getAttribute('aria-busy')).toBe('true');
		expect(button.classList.contains('is-pending')).toBe(true);
		expect(slot?.querySelector('.btn-spinner')).not.toBeNull();
		expect(slot?.querySelector('[data-testid="icon"]')).not.toBeNull();
		expect(button.querySelector('.btn-pending-overlay')).toBeNull();
	});

	it('covers the label with a centered spinner when there is no icon', () => {
		render(<Button isPending>Remover</Button>);
		const button = screen.getByRole('button', { name: 'Remover' }) as HTMLButtonElement;

		expect(button.querySelector('.btn-pending-label')?.textContent).toBe('Remover');
		expect(button.querySelector('.btn-pending-overlay .btn-spinner')).not.toBeNull();
	});

	it('stays disabled when the caller disables it, pending or not', () => {
		render(<Button disabled>Salvar</Button>);

		expect((screen.getByRole('button', { name: 'Salvar' }) as HTMLButtonElement).disabled).toBe(true);
	});
});
