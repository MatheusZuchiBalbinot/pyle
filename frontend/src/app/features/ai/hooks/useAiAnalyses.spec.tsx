import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiAnalysis, GenerateAiAnalysisInput } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildConsoleHarness } from '@/test/consoleHarness';

import { useAiAnalyses } from './useAiAnalyses';
import { useGenerateAnalysis } from './useGenerateAnalysis';

vi.mock('../../../api/adminApiClient', () => ({
	listAiAnalyses: vi.fn(),
	generateAiAnalysis: vi.fn(),
	AdminApiError: class AdminApiError extends Error {
		readonly statusCode: number;

		constructor(message: string, statusCode: number) {
			super(message);
			this.name = 'AdminApiError';
			this.statusCode = statusCode;
		}
	},
}));

const { AdminApiError, generateAiAnalysis, listAiAnalyses } = await import('../../../api/adminApiClient');

const AT = '2026-03-01T10:00:00.000Z';
const ANALYSIS = { id: 'a1', riskLevel: 'low', scope: 'platform' } as AiAnalysis;
const PLATFORM_INPUT = { scope: 'platform' } as GenerateAiAnalysisInput;

describe('useAiAnalyses', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('walks the list a page at a time for the given filter', async () => {
		vi.mocked(listAiAnalyses).mockResolvedValue({ items: [ANALYSIS], nextCursor: null });
		const harness = buildConsoleHarness();

		const { result } = renderHook(() => useAiAnalyses({ scope: 'platform' }), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		expect(listAiAnalyses).toHaveBeenCalledWith({ scope: 'platform', subjectId: undefined }, { limit: undefined });
	});

	it('reloads from the top when a new analysis is announced, since it belongs there', async () => {
		vi.mocked(listAiAnalyses).mockResolvedValue({ items: [], nextCursor: null });
		const harness = buildConsoleHarness();
		const { result } = renderHook(() => useAiAnalyses({}), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({
				type: 'ai.analysis.ready',
				scope: 'platform',
				subjectId: null,
				subjectName: null,
				analysisId: 'a2',
				riskLevel: 'low',
				occurredAt: AT,
			});
		});

		await waitFor(() => expect(listAiAnalyses).toHaveBeenCalledTimes(2));
	});

	it('reloads on a write to the analyses table too', async () => {
		vi.mocked(listAiAnalyses).mockResolvedValue({ items: [], nextCursor: null });
		const harness = buildConsoleHarness();
		const { result } = renderHook(() => useAiAnalyses({}), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'entity.changed', entity: 'AiAnalysis', action: 'created', id: null, occurredAt: AT });
		});

		await waitFor(() => expect(listAiAnalyses).toHaveBeenCalledTimes(2));
	});

	it('does not reload for an unrelated event', async () => {
		vi.mocked(listAiAnalyses).mockResolvedValue({ items: [], nextCursor: null });
		const harness = buildConsoleHarness();
		const { result } = renderHook(() => useAiAnalyses({}), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down', occurredAt: AT });
		});

		expect(listAiAnalyses).toHaveBeenCalledTimes(1);
	});

	it('keeps the same loader while the filter is unchanged, so it does not refetch every render', async () => {
		vi.mocked(listAiAnalyses).mockResolvedValue({ items: [], nextCursor: null });
		const harness = buildConsoleHarness();
		const { result, rerender } = renderHook(() => useAiAnalyses({ scope: 'route', subjectId: 'r1' }), { wrapper: harness.wrapper });

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		rerender();
		rerender();

		expect(listAiAnalyses).toHaveBeenCalledTimes(1);
	});
});

describe('useGenerateAnalysis', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	function renderGenerate(input: GenerateAiAnalysisInput = PLATFORM_INPUT) {
		const harness = buildConsoleHarness();
		const rendered = renderHook(() => useGenerateAnalysis(input), { wrapper: harness.wrapper });

		return { ...rendered, harness };
	}

	it('starts idle', () => {
		const { result } = renderGenerate();

		expect(result.current.state).toEqual({ status: 'idle' });
	});

	it('requests the analysis, announces the risk and opens it', async () => {
		vi.mocked(generateAiAnalysis).mockResolvedValue(ANALYSIS);
		const { result, harness } = renderGenerate();

		await act(async () => {
			await result.current.generate();
		});

		expect(generateAiAnalysis).toHaveBeenCalledWith(PLATFORM_INPUT);
		expect(harness.toasts()).toEqual([{ message: 'aiAnalysis.ready', tone: 'success' }]);
		expect(result.current.state).toEqual({ status: 'idle' });
	});

	it('explains the cooldown behind a 409', async () => {
		vi.mocked(generateAiAnalysis).mockRejectedValue(new AdminApiError('Too soon', 409));
		const { result, harness } = renderGenerate();

		await act(async () => {
			await result.current.generate();
		});

		expect(result.current.state).toEqual({ status: 'error', message: 'aiAnalysis.cooldown' });
		expect(harness.toasts()).toEqual([{ message: 'aiAnalysis.cooldown', tone: 'danger' }]);
	});

	it('explains a missing API key behind a 503', async () => {
		vi.mocked(generateAiAnalysis).mockRejectedValue(new AdminApiError('No key', 503));
		const { result } = renderGenerate();

		await act(async () => {
			await result.current.generate();
		});

		expect(result.current.state).toEqual({ status: 'error', message: 'aiAnalysis.notConfigured' });
	});

	it('passes any other API message through as it is', async () => {
		vi.mocked(generateAiAnalysis).mockRejectedValue(new AdminApiError('Rota não encontrada', 404));
		const { result } = renderGenerate();

		await act(async () => {
			await result.current.generate();
		});

		expect(result.current.state).toEqual({ status: 'error', message: 'Rota não encontrada' });
	});

	it('falls back to a generic message for a failure that is not from the API', async () => {
		vi.mocked(generateAiAnalysis).mockRejectedValue(new TypeError('offline'));
		const { result } = renderGenerate();

		await act(async () => {
			await result.current.generate();
		});

		expect(result.current.state).toEqual({ status: 'error', message: 'aiAnalysis.failed' });
	});

	it('reports that it is generating while the request is open', async () => {
		let resolveCall: ((analysis: AiAnalysis) => void) | undefined;

		vi.mocked(generateAiAnalysis).mockImplementation(
			() =>
				new Promise<AiAnalysis>((resolve) => {
					resolveCall = resolve;
				}),
		);
		const { result } = renderGenerate();

		let pending: Promise<void> | undefined;

		act(() => {
			pending = result.current.generate();
		});
		await waitFor(() => expect(result.current.state).toEqual({ status: 'generating' }));
		await act(async () => {
			resolveCall?.(ANALYSIS);
			await pending;
		});

		expect(result.current.state).toEqual({ status: 'idle' });
	});
});
