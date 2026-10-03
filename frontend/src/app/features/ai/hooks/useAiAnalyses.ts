import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { getAiAnalysisSummary, listAiAnalyses } from '@/app/api/adminApiClient';
import type { AiAnalysis, AiAnalysisSummary, ListAiAnalysesFilter, PageQuery } from '@/app/api/adminApiTypes';
import { isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useAsyncResource, type AsyncResourceState, type UseAsyncResourceOptions } from '@/app/hooks/useAsyncResource';
import { usePaginatedResource, type UsePaginatedResourceOptions, type UsePaginatedResourceResult } from '@/app/hooks/usePaginatedResource';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { analysisSubjectKey } from '../lib/analysisSubject';

export type UseAiAnalysesResult = UsePaginatedResourceResult<AiAnalysis>;

export type AiAnalysisSummaryLoadState = AsyncResourceState<AiAnalysisSummary>;

// No polling: a new analysis announces itself (ai.analysis.ready), and the list reloads
// from the first page.
export function useAiAnalyses(filter: ListAiAnalysesFilter): UseAiAnalysesResult {
	const { t } = useTranslation();
	const { scope, subjectId } = filter;
	const stableFilter = useMemo(() => ({ scope, subjectId }), [scope, subjectId]);
	const load = useCallback((page: PageQuery) => listAiAnalyses(stableFilter, page), [stableFilter]);

	const options: UsePaginatedResourceOptions = {
		queryKey: queryKeys.aiAnalyses(stableFilter),
		fallbackErrorMessage: t('aiAnalysis.loadError'),
		refetchOn: isAnalysisEvent,
	};

	return usePaginatedResource(load, options);
}

// From the server: the list is paged, so counting it would only count what was loaded.
export function useAiAnalysisSummary(): AiAnalysisSummaryLoadState {
	const { t } = useTranslation();
	const options: UseAsyncResourceOptions<AiAnalysisSummary> = {
		queryKey: queryKeys.aiAnalysisSummary(),
		fallbackErrorMessage: t('aiAnalysis.loadError'),
		refetchOn: isAnalysisEvent,
	};
	const { loadState } = useAsyncResource(getAiAnalysisSummary, options);

	return loadState;
}

// Until the server answers, the loaded rows' best guess: never a blank tile.
export function toAnalysisTotals(summaryState: AiAnalysisSummaryLoadState, loaded: readonly AiAnalysis[]): AiAnalysisSummary {
	if (summaryState.status === LOAD_STATUS.loaded) {
		return summaryState.data;
	}

	return {
		totalCount: loaded.length,
		subjectCount: new Set(loaded.map(analysisSubjectKey)).size,
		highRiskCount: loaded.filter((analysis) => analysis.riskLevel === 'high').length,
	};
}

function isAnalysisEvent(event: RealtimeEvent): boolean {
	return event.type === 'ai.analysis.ready' || isEntityChange(event, ['AiAnalysis']);
}
