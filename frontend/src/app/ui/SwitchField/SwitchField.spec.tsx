import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SwitchField } from './SwitchField';

describe('SwitchField', () => {
	it('toggles from a click on its text, not only on the switch', () => {
		const onToggle = vi.fn();

		render(<SwitchField isOn={false} label="Todas as rotas" hint="Inclui rotas criadas depois" onToggle={onToggle} />);
		fireEvent.click(screen.getByText('Inclui rotas criadas depois'));

		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it('toggles once from a click on the switch itself', () => {
		const onToggle = vi.fn();

		render(<SwitchField isOn label="Todas as rotas" hint="Inclui rotas criadas depois" onToggle={onToggle} />);
		fireEvent.click(screen.getByRole('switch', { name: 'Todas as rotas' }));

		expect(onToggle).toHaveBeenCalledTimes(1);
	});
});
