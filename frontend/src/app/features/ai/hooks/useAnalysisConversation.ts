import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, askAiAnalysis, listAiAnalysisMessages } from '@/app/api/adminApiClient';
import type { AiAnalysisMessage, AiReplyEvent } from '@/app/api/adminApiTypes';
import { isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useAsyncResource, type AsyncResourceState } from '@/app/hooks/useAsyncResource';

export type PendingTurn = {
	readonly question: string;
	readonly partialAnswer: string;
	readonly consultingTool: string | null;
};

export type UseAnalysisConversationResult = {
	readonly loadState: AsyncResourceState<readonly AiAnalysisMessage[]>;
	readonly pendingTurn: PendingTurn | null;
	readonly errorMessage: string | null;
	readonly ask: (question: string) => Promise<void>;
};

// Other tabs' messages arrive through entity.changed; this tab's turn by refetching once
// its stream closes.
export function useAnalysisConversation(analysisId: string): UseAnalysisConversationResult {
	const { t } = useTranslation();
	const load = useCallback(() => listAiAnalysisMessages(analysisId), [analysisId]);
	const { loadState, refetch } = useAsyncResource(load, {
		queryKey: queryKeys.aiConversation(analysisId),
		fallbackErrorMessage: t('aiAnalysis.chat.loadError'),
		refetchOn: isConversationEvent,
	});
	const [pendingTurn, setPendingTurn] = useState<PendingTurn | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => abortRef.current?.abort();
	}, [analysisId]);

	const applyReplyEvent = useCallback(
		(event: AiReplyEvent): void => {
			switch (event.type) {
				case 'text':
					setPendingTurn((current) => current && { ...current, partialAnswer: current.partialAnswer + event.delta, consultingTool: null });

					return;
				case 'tool_call':
					setPendingTurn((current) => current && { ...current, consultingTool: event.name });

					return;
				case 'error':
					setErrorMessage(t('aiAnalysis.chat.askError', { message: event.message }));

					return;
				// The refetched thread is what shows the answer.
				case 'done':
				case 'message':
					return;
				default:
					assertUnreachable(event);
			}
		},
		[t],
	);

	const ask = useCallback(
		async (question: string) => {
			const controller = new AbortController();

			abortRef.current = controller;
			setErrorMessage(null);
			setPendingTurn({ question, partialAnswer: '', consultingTool: null });

			try {
				for await (const event of askAiAnalysis(analysisId, question, controller.signal)) {
					applyReplyEvent(event);
				}

				await refetch();
			} catch (error) {
				if (controller.signal.aborted) {
					return;
				}

				if (!(error instanceof AdminApiError)) {
					console.error(error);
				}

				const message = error instanceof AdminApiError ? error.message : t('common.unexpectedError');

				setErrorMessage(t('aiAnalysis.chat.askError', { message }));
			} finally {
				if (!controller.signal.aborted) {
					setPendingTurn(null);
				}
			}
		},
		[analysisId, applyReplyEvent, refetch, t],
	);

	return { loadState, pendingTurn, errorMessage, ask };
}

function isConversationEvent(event: RealtimeEvent): boolean {
	return isEntityChange(event, ['AiAnalysisMessage']);
}

function assertUnreachable(value: never): never {
	throw new Error(`Unhandled AI reply event: ${JSON.stringify(value)}`);
}
