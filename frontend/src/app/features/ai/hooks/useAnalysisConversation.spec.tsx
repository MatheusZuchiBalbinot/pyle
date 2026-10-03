import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AiAnalysisMessage, AiReplyEvent } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { buildConsoleHarness } from '@/test/consoleHarness';

import { useAnalysisConversation } from './useAnalysisConversation';

vi.mock('../../../api/adminApiClient', () => ({
	listAiAnalysisMessages: vi.fn(),
	askAiAnalysis: vi.fn(),
	AdminApiError: class AdminApiError extends Error {},
}));

const { AdminApiError, askAiAnalysis, listAiAnalysisMessages } = await import('../../../api/adminApiClient');

const ANALYSIS_ID = 'a1';
const AT = '2026-03-01T10:00:00.000Z';
const STORED_MESSAGE = { id: 'm1', role: 'user', content: 'por quê?', createdAt: AT } as AiAnalysisMessage;

// Replays a scripted reply stream, honouring the abort signal the hook passes.
function scriptReply(events: readonly AiReplyEvent[]): void {
	vi.mocked(askAiAnalysis).mockImplementation(async function* () {
		for (const event of events) {
			yield event;
		}
	} as never);
}

function renderConversation(analysisId = ANALYSIS_ID) {
	const harness = buildConsoleHarness();
	const rendered = renderHook((id: string) => useAnalysisConversation(id), { wrapper: harness.wrapper, initialProps: analysisId });

	return { ...rendered, harness };
}

describe('useAnalysisConversation', () => {
	afterEach(() => {
		vi.clearAllMocks();
	});

	it('loads the persisted thread of the analysis', async () => {
		vi.mocked(listAiAnalysisMessages).mockResolvedValue([STORED_MESSAGE]);

		const { result } = renderConversation();

		await waitFor(() => expect(result.current.loadState).toEqual({ status: LOAD_STATUS.loaded, data: [STORED_MESSAGE] }));
		expect(listAiAnalysisMessages).toHaveBeenCalledWith(ANALYSIS_ID);
	});

	it('reloads the thread when a message is written from another tab', async () => {
		vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
		const { result, harness } = renderConversation();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

		await act(async () => {
			harness.emit({ type: 'entity.changed', entity: 'AiAnalysisMessage', action: 'created', id: null, occurredAt: AT });
		});

		await waitFor(() => expect(listAiAnalysisMessages).toHaveBeenCalledTimes(2));
	});

	describe('asking a question', () => {
		it('accumulates the answer as it streams, then refetches the persisted thread', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			scriptReply([
				{ type: 'text', delta: 'O risco ' },
				{ type: 'text', delta: 'é baixo.' },
				{ type: 'done', text: 'O risco é baixo.' },
			] as AiReplyEvent[]);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				await result.current.ask('por quê?');
			});

			expect(askAiAnalysis).toHaveBeenCalledWith(ANALYSIS_ID, 'por quê?', expect.any(AbortSignal));
			expect(listAiAnalysisMessages).toHaveBeenCalledTimes(2);
			expect(result.current.pendingTurn).toBeNull();
		});

		it('shows which tool the model is consulting, and clears it once text resumes', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			// The stream pauses between events so the test can read the turn
			// the panel would be rendering at that moment.
			const gate = { release: () => undefined as void };
			const waitForRelease = (): Promise<void> =>
				new Promise<void>((resolve) => {
					gate.release = resolve;
				});

			vi.mocked(askAiAnalysis).mockImplementation(async function* () {
				yield { type: 'tool_call', name: 'get_route_stats' };
				await waitForRelease();
				yield { type: 'text', delta: 'pronto' };
			} as never);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			let pending: Promise<void> | undefined;

			act(() => {
				pending = result.current.ask('por quê?');
			});
			await waitFor(() => expect(result.current.pendingTurn?.consultingTool).toBe('get_route_stats'));

			await act(async () => {
				gate.release();
				await pending;
			});

			expect(result.current.errorMessage).toBeNull();
		});

		it('keeps the question visible while its answer is still streaming', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			const gate = { release: () => undefined as void };
			const waitForRelease = (): Promise<void> =>
				new Promise<void>((resolve) => {
					gate.release = resolve;
				});

			vi.mocked(askAiAnalysis).mockImplementation(async function* () {
				yield { type: 'text', delta: 'O risco ' };
				await waitForRelease();
				yield { type: 'text', delta: 'é baixo.' };
			} as never);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			let pending: Promise<void> | undefined;

			act(() => {
				pending = result.current.ask('por quê?');
			});

			await waitFor(() => expect(result.current.pendingTurn).toEqual({ question: 'por quê?', partialAnswer: 'O risco ', consultingTool: null }));
			await act(async () => {
				gate.release();
				await pending;
			});
		});

		it('surfaces an error the stream itself reported', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			scriptReply([{ type: 'error', message: 'modelo indisponível' }] as AiReplyEvent[]);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				await result.current.ask('por quê?');
			});

			expect(result.current.errorMessage).toBe('aiAnalysis.chat.askError');
		});

		it('surfaces a request that failed outright', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			vi.mocked(askAiAnalysis).mockImplementation((() => {
				throw new AdminApiError('IA não configurada', 409);
			}) as never);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));

			await act(async () => {
				await result.current.ask('por quê?');
			});

			expect(result.current.errorMessage).toBe('aiAnalysis.chat.askError');
			expect(result.current.pendingTurn).toBeNull();
		});

		it('clears a previous error when a new question starts', async () => {
			vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
			scriptReply([{ type: 'error', message: 'falhou' }] as AiReplyEvent[]);
			const { result } = renderConversation();

			await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
			await act(async () => {
				await result.current.ask('primeira');
			});
			expect(result.current.errorMessage).not.toBeNull();

			scriptReply([{ type: 'done', text: 'ok' }] as AiReplyEvent[]);
			await act(async () => {
				await result.current.ask('segunda');
			});

			expect(result.current.errorMessage).toBeNull();
		});
	});

	// Otherwise the answer to a question about the previous analysis would
	// keep streaming into a panel showing a different one.
	it('cancels a stream still open when the panel switches to another analysis', async () => {
		vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
		let capturedSignal: AbortSignal | undefined;

		vi.mocked(askAiAnalysis).mockImplementation(async function* (_id: string, _question: string, signal?: AbortSignal) {
			capturedSignal = signal;
			await new Promise(() => undefined);
			yield { type: 'done', text: '' };
		} as never);
		const { result, rerender } = renderConversation();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		act(() => {
			void result.current.ask('por quê?');
		});
		await waitFor(() => expect(capturedSignal).toBeDefined());

		rerender('a2');

		expect(capturedSignal?.aborted).toBe(true);
	});

	it('cancels the stream on unmount too', async () => {
		vi.mocked(listAiAnalysisMessages).mockResolvedValue([]);
		let capturedSignal: AbortSignal | undefined;

		vi.mocked(askAiAnalysis).mockImplementation(async function* (_id: string, _question: string, signal?: AbortSignal) {
			capturedSignal = signal;
			await new Promise(() => undefined);
			yield { type: 'done', text: '' };
		} as never);
		const { result, unmount } = renderConversation();

		await waitFor(() => expect(result.current.loadState.status).toBe(LOAD_STATUS.loaded));
		act(() => {
			void result.current.ask('por quê?');
		});
		await waitFor(() => expect(capturedSignal).toBeDefined());

		unmount();

		expect(capturedSignal?.aborted).toBe(true);
	});
});
