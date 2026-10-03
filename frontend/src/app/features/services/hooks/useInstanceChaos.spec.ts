import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminApiError, clearInstanceChaos, setInstanceChaos } from '@/app/api/adminApiClient';
import { buildRealtimeHarness } from '@/test/realtimeHarness';

import { CHAOS_PRESETS, chaosModeOf, isChaosActive, NO_CHAOS, useInstanceChaos } from './useInstanceChaos';

vi.mock('../../../api/adminApiClient', () => ({
	setInstanceChaos: vi.fn(),
	clearInstanceChaos: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.statusCode = statusCode;
		}
	},
}));

const TARGET = { serviceSlug: 'orders', instanceId: 'i2', instanceName: 'orders-2' };

function render() {
	const realtime = buildRealtimeHarness();

	return { ...renderHook(() => useInstanceChaos(TARGET), { wrapper: realtime.wrapper }), realtime };
}

describe('useInstanceChaos', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('turns each preset into its fault, and tells the console', async () => {
		vi.mocked(setInstanceChaos).mockImplementation(async (_slug, _id, chaos) => chaos);
		const { result, realtime } = render();

		await act(() => result.current.applyPreset('slow'));
		await act(() => result.current.applyPreset('flaky'));
		await act(() => result.current.applyPreset('down'));

		expect(vi.mocked(setInstanceChaos).mock.calls.map(([, , chaos]) => chaos)).toEqual([CHAOS_PRESETS.slow, CHAOS_PRESETS.flaky, CHAOS_PRESETS.down]);
		expect(CHAOS_PRESETS).toEqual({
			slow: { ...NO_CHAOS, latencyMs: 800 },
			flaky: { ...NO_CHAOS, errorRate: 0.3 },
			down: { ...NO_CHAOS, isDown: true },
		});
		expect(realtime.events().at(-1)).toMatchObject({ type: 'chaos.changed', instanceId: 'i2', chaos: CHAOS_PRESETS.down });
	});

	it('normalizes through the clear call', async () => {
		vi.mocked(clearInstanceChaos).mockResolvedValue(NO_CHAOS);
		const { result } = render();

		await act(() => result.current.normalize());

		expect(clearInstanceChaos).toHaveBeenCalledWith('orders', 'i2');
		expect(result.current.errorKey).toBeNull();
	});

	it('explains chaos turned off, an instance that did not answer, and anything else', async () => {
		vi.mocked(setInstanceChaos)
			.mockRejectedValueOnce(new AdminApiError('off', 403))
			.mockRejectedValueOnce(new AdminApiError('down', 502))
			.mockRejectedValueOnce(new AdminApiError('boom', 500))
			.mockRejectedValueOnce(new Error('network'));
		const { result } = render();
		const keys: (string | null)[] = [];

		for (let index = 0; index < 4; index++) {
			await act(() => result.current.applyPreset('slow'));
			keys.push(result.current.errorKey);
		}

		expect(keys).toEqual(['chaos.errors.disabled', 'chaos.errors.unreachable', 'common.unexpectedError', 'common.unexpectedError']);
		expect(result.current.isApplying).toBe(false);
	});

	it('tells which preset runs, a hand-set mix, or nothing', () => {
		expect(chaosModeOf(null)).toEqual({ kind: 'off' });
		expect(chaosModeOf(NO_CHAOS)).toEqual({ kind: 'off' });
		expect(chaosModeOf(CHAOS_PRESETS.slow)).toEqual({ kind: 'preset', preset: 'slow' });
		expect(chaosModeOf(CHAOS_PRESETS.down)).toEqual({ kind: 'preset', preset: 'down' });
		expect(chaosModeOf({ ...CHAOS_PRESETS.slow, jitterMs: 50 })).toEqual({ kind: 'custom' });
	});

	it('knows when any fault is on', () => {
		expect(isChaosActive(null)).toBe(false);
		expect(isChaosActive(NO_CHAOS)).toBe(false);
		expect(isChaosActive({ ...NO_CHAOS, jitterMs: 5 })).toBe(true);
	});
});
