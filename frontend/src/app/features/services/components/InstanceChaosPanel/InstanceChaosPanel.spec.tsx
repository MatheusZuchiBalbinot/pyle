import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CHAOS_PRESETS } from '@/app/features/services/hooks/useInstanceChaos';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { InstanceChaosPanel } from './InstanceChaosPanel';

vi.mock('../../../../api/adminApiClient', () => ({
	setInstanceChaos: vi.fn(),
	clearInstanceChaos: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const TARGET = { serviceSlug: 'orders', instanceId: 'i2', instanceName: 'orders-2' };

function renderPanel(current: Parameters<typeof InstanceChaosPanel>[0]['current']): void {
	const realtime = buildRealtimeHarness();

	function wrapper({ children }: { children: ReactNode }): ReactNode {
		return realtime.wrapper({ children });
	}

	render(<InstanceChaosPanel target={TARGET} current={current} />, { wrapper });
}

describe('InstanceChaosPanel', () => {
	it('marks the running fault, says it in the header and lets it be normalized', () => {
		renderPanel(CHAOS_PRESETS.slow);

		expect(screen.getByRole('button', { name: /^chaos.presets.slow/ })).toHaveProperty('ariaPressed', 'true');
		expect(screen.getByRole('button', { name: /^chaos.presets.flaky/ })).toHaveProperty('ariaPressed', 'false');
		expect(screen.getByText('chaos.status.slow')).toBeDefined();
		expect(screen.getByRole('button', { name: /chaos.normalize/ })).toHaveProperty('disabled', false);
	});

	it('has nothing to normalize while no fault runs', () => {
		renderPanel(null);

		expect(screen.getByText('chaos.status.off')).toBeDefined();
		expect(screen.getByRole('button', { name: /chaos.normalize/ })).toHaveProperty('disabled', true);
	});

	it('opens the manual values on what the instance runs now', () => {
		renderPanel(CHAOS_PRESETS.slow);
		fireEvent.click(screen.getByRole('button', { name: /chaos.advanced/ }));

		expect(screen.getByRole('textbox', { name: 'chaos.fields.latency' })).toHaveProperty('value', '800');
	});
});
