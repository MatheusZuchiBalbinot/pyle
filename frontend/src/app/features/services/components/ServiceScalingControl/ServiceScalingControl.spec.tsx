import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { setServiceReplicas } from '@/app/api/adminApiClient';
import type { Service } from '@/app/api/adminApiTypes';
import { buildInstance, buildService } from '@/test/gatewayFixtures';
import { buildGatewayHarness } from '@/test/gatewayHarness';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { ServiceScalingControl } from './ServiceScalingControl';

vi.mock('../../../../api/adminApiClient', () => ({
	setServiceReplicas: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const MAX = 4;
const onToggleInstance = vi.fn();

function scalable(desiredManagedReplicas: number): Service {
	const instances = [buildInstance('orders-1'), buildInstance('orders-m-1', { source: 'managed', scalingState: 'running' })];

	return buildService('orders', { scaling: { profile: 'demo_orders', desiredManagedReplicas }, instances });
}

function renderControl(service: Service, maxManagedReplicas: number | null): void {
	const gateway = buildGatewayHarness();
	const realtime = buildRealtimeHarness();

	function Wrapper({ children }: { children: ReactNode }): ReactNode {
		return gateway.wrapper({ children: realtime.wrapper({ children }) });
	}

	const control = (
		<ServiceScalingControl service={service} maxManagedReplicas={maxManagedReplicas} expandedInstanceId={null} onToggleInstance={onToggleInstance} />
	);

	render(control, { wrapper: Wrapper });
}

function clickButton(name: string): void {
	fireEvent.click(screen.getByRole('button', { name }));
}

describe('ServiceScalingControl', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('shows one pill per replica and the free room as text, with the state as text', () => {
		renderControl(scalable(1), MAX);

		const list = screen.getByRole('list', { name: 'services.scaling.listLabel' });

		// The replica, then one line for the three free slots.
		expect(within(list).getAllByRole('listitem')).toHaveLength(2);
		expect(within(list).getByText('services.scaling.freeSlots')).toBeTruthy();
		expect(within(list).getByText('services.scaling.replicaLabel')).toBeTruthy();
		expect(screen.getByRole('status').textContent).toBe('services.scaling.ready');
	});

	it('says none was asked for instead of 0/0 when no replica is wanted', () => {
		renderControl(scalable(0), MAX);

		expect(screen.getByRole('status').textContent).toBe('services.scaling.none');
	});

	it('opens a replica in the instance table from its pill', () => {
		renderControl(scalable(1), MAX);

		clickButton('services.scaling.replicaLabel');

		expect(onToggleInstance).toHaveBeenCalledWith('id-orders-m-1');
	});

	it('offers Aplicar only once the number differs, and Cancelar puts it back', () => {
		renderControl(scalable(1), MAX);

		expect(screen.queryByRole('button', { name: 'services.scaling.apply' })).toBeNull();

		clickButton('services.scaling.increase');
		expect(screen.getByText('services.scaling.diff')).toBeTruthy();
		expect(screen.queryByText('services.scaling.reduceNote')).toBeNull();

		clickButton('services.scaling.cancel');
		expect(screen.queryByRole('button', { name: 'services.scaling.apply' })).toBeNull();
		expect(setServiceReplicas).not.toHaveBeenCalled();
	});

	it('warns that a reduction drains, and applies the chosen number', async () => {
		vi.mocked(setServiceReplicas).mockResolvedValue(scalable(0));
		renderControl(scalable(1), MAX);

		clickButton('services.scaling.decrease');
		expect(screen.getByText('services.scaling.reduceNote')).toBeTruthy();

		await act(async () => clickButton('services.scaling.apply'));

		expect(setServiceReplicas).toHaveBeenCalledWith('orders', 0);
	});

	it('explains why there is no control when scaling is off', () => {
		renderControl(scalable(1), null);

		expect(screen.getByText('services.scaling.disabled')).toBeTruthy();
		expect(screen.queryByRole('list')).toBeNull();
	});
});
