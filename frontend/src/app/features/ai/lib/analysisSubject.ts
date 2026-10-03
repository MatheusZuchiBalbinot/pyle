import type { TFunction } from 'i18next';

import type { AiAnalysis, AiAnalysisScope, ListAiAnalysesFilter } from '@/app/api/adminApiTypes';

export type AnalysisListFilter = {
	readonly scope: AiAnalysisScope | 'all';
	readonly subjectId: string | null;
};

export type SubjectOption = { readonly value: string; readonly label: string };

export type SubjectScope = 'route' | 'service';

type AnalysisSubjectFields = Pick<AiAnalysis, 'subjectName'>;
type NamedSubject = { readonly id: string; readonly name: string };

export const ALL_ANALYSES: AnalysisListFilter = { scope: 'all', subjectId: null };

export function analysisSubjectLabel(analysis: AnalysisSubjectFields, t: TFunction): string {
	return analysis.subjectName ?? t('aiAnalysis.platformSubject');
}

export function analysisSubjectKey(analysis: Pick<AiAnalysis, 'subjectId'>): string {
	return analysis.subjectId ?? 'platform';
}

// A deleted subject keeps its recorded name, marked. Null ids: lists not loaded, nothing
// marked.
export function describeAnalysisSubject(
	analysis: Pick<AiAnalysis, 'scope' | 'subjectId' | 'subjectName'>,
	t: TFunction,
	existingSubjectIds: ReadonlySet<string> | null,
): string {
	const label = analysisSubjectLabel(analysis, t);
	const isRemoved = analysis.subjectId !== null && existingSubjectIds !== null && !existingSubjectIds.has(analysis.subjectId);

	if (!isRemoved) {
		return label;
	}

	return t(`aiAnalysis.removedSubject.${analysis.scope}`, { name: label });
}

export function toListAnalysesFilter(filter: AnalysisListFilter): ListAiAnalysesFilter {
	if (filter.scope === 'all') {
		return {};
	}

	if (filter.subjectId === null) {
		return { scope: filter.scope };
	}

	return { scope: filter.scope, subjectId: filter.subjectId };
}

export function subjectOptions(subjects: readonly NamedSubject[], t: TFunction): readonly SubjectOption[] {
	const sorted = [...subjects].sort((left, right) => left.name.localeCompare(right.name));

	return [{ value: '', label: t('aiAnalysis.allSubjects') }, ...sorted.map((subject) => ({ value: subject.id, label: subject.name }))];
}

export function subjectScopeOf(scope: AnalysisListFilter['scope']): SubjectScope | null {
	if (scope === 'route' || scope === 'service') {
		return scope;
	}

	return null;
}
