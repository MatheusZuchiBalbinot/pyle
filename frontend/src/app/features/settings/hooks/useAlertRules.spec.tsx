import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AlertRuleConfig } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildConsoleHarness } from '@/test/consoleHarness';

import { useAlertRules } from './useAlertRules';

vi.mock('../../../api/adminApiClient', () => ({
	getAlertRules: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const { getAlertRules } = await import('../../../api/adminApiClient');

const AT = '2026-03-01T10:00:00.000Z';
const RULE: AlertRuleConfig = { kind: 'route_p95_latency', isEnabled: true, threshold: 800, sustainedWindows: 3 };

function renderRules() {
	const harness = buildConsoleHarness();
	const rendered = renderHook(() => useAlertRules(), { wrapper: harness.wrapper });

	return { ...rendered, harness };
}

describe('useAlertRules', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('loads the global rules', async () => {
		vi.mocked(getAlertRules).mockResolvedValue([RULE]);

		const { result } = renderRules();

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: [RULE] }));
	});

	it('refetches on a write to the rules table, such as one from another tab', async () => {
		vi.mocked(getAlertRules).mockResolvedValue([RULE]);
		const { result, harness } = renderRules();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'entity.changed', entity: 'AlertRuleConfig', action: 'updated', id: null, occurredAt: AT });
		});

		await waitFor(() => expect(getAlertRules).toHaveBeenCalledTimes(2));
	});

	it('ignores an event about anything else', async () => {
		vi.mocked(getAlertRules).mockResolvedValue([RULE]);
		const { result, harness } = renderRules();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'entity.changed', entity: 'Route', action: 'updated', id: 'r1', occurredAt: AT });
		});

		expect(getAlertRules).toHaveBeenCalledTimes(1);
	});

	it('surfaces a failure with its own message', async () => {
		vi.mocked(getAlertRules).mockRejectedValue(new TypeError('offline'));

		const { result } = renderRules();

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.error, message: 'alertRuleConfigPanel.loadError' }));
	});
});
