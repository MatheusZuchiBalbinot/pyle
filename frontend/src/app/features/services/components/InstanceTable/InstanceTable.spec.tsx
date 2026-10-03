import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Service } from '@/app/api/adminApiTypes';
import type { ServiceActions } from '@/app/features/services/hooks/useServiceActions';
import { buildInstance, buildService } from '@/test/gatewayFixtures';

import { InstanceTable } from './InstanceTable';

function buildActions(): ServiceActions {
	return {
		drain: vi.fn(),
		enable: vi.fn(),
		setWeight: vi.fn().mockResolvedValue(undefined),
		setStrategy: vi.fn(),
		removal: null,
		requestRemoveInstance: vi.fn(),
		requestRemoveService: vi.fn(),
		cancelRemoval: vi.fn(),
		confirmRemoval: vi.fn(),
	};
}

function weightedService(weight: number): Service {
	return buildService('catalog', { lbStrategy: 'weighted_random', instances: [buildInstance('catalog-1', { weight })] });
}

describe('InstanceTable weight input', () => {
	it('saves a new weight on blur, and follows the weight when it changes underneath (a rolled-back edit)', () => {
		const actions = buildActions();
		const { rerender } = render(
			<InstanceTable service={weightedService(3)} traffic={null} expandedInstanceId={null} onToggle={vi.fn()} actions={actions} />,
		);
		const input = screen.getByRole('textbox', { name: 'services.instances.weightLabel' });

		fireEvent.change(input, { target: { value: '7' } });
		fireEvent.blur(input);
		expect(actions.setWeight).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'catalog-1' }), 7);

		rerender(<InstanceTable service={weightedService(3)} traffic={null} expandedInstanceId={null} onToggle={vi.fn()} actions={actions} />);
		expect(input).toHaveProperty('value', '7');

		rerender(<InstanceTable service={weightedService(4)} traffic={null} expandedInstanceId={null} onToggle={vi.fn()} actions={actions} />);
		expect(input).toHaveProperty('value', '4');
	});
});
