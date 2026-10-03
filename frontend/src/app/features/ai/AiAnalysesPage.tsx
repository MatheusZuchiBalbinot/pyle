import type { TFunction } from 'i18next';
import { AlertTriangle, Building2, Sparkles } from 'lucide-react';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiAnalysis } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { useScrollIntoViewWhen } from '@/app/hooks/useScrollIntoViewWhen';
import { formatDateTime } from '@/app/lib/format';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { DashboardCard } from '@/app/ui/DashboardCard/DashboardCard';
import { DashboardSkeleton, type DashboardSkeletonCard } from '@/app/ui/DashboardSkeleton/DashboardSkeleton';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';
import { LoadMoreFooter } from '@/app/ui/LoadMoreFooter/LoadMoreFooter';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { StatusBadge } from '@/app/ui/StatusBadge/StatusBadge';
import { StatusIntro } from '@/app/ui/StatusIntro/StatusIntro';

import { AiAnalysisCard } from './components/AiAnalysisCard/AiAnalysisCard';
import { RISK_STATUS, RISK_TONE } from './components/AiAnalysisCard/riskTone';
import { AnalysisSubjectPicker } from './components/AnalysisSubjectPicker/AnalysisSubjectPicker';
import { AnalyzeButton } from './components/AnalyzeButton/AnalyzeButton';
import { toAnalysisTotals, useAiAnalyses, useAiAnalysisSummary } from './hooks/useAiAnalyses';
import { useAnalysisSubjects } from './hooks/useAnalysisSubjects';
import {
	ALL_ANALYSES,
	analysisSubjectLabel,
	describeAnalysisSubject,
	subjectScopeOf,
	toListAnalysesFilter,
	type AnalysisListFilter,
} from './lib/analysisSubject';
import { ScopeFilters, type ScopeFilter } from './ScopeFilters';

import './AiAnalysesPage.css';

const SKELETON_ROWS = 4;

type FilterAnalyzeButtonProps = { readonly filter: AnalysisListFilter };

export function AiAnalysesPage(): ReactElement {
	const { t, i18n } = useTranslation();
	const locale = i18n.language;
	const { selection, openAnalysis, clearSelection } = useGateway();
	const selectedAnalysisId = selection?.type === 'analysis' ? selection.analysisId : null;
	const [filter, setFilter] = useState<AnalysisListFilter>(ALL_ANALYSES);
	const listFilter = useMemo(() => toListAnalysesFilter(filter), [filter]);
	const { loadState, isLoadingMore, loadMore } = useAiAnalyses(listFilter);
	const summaryState = useAiAnalysisSummary();
	const subjects = useAnalysisSubjects();
	const columns = useMemo(() => buildColumns(t, locale, subjects.existingIds), [t, locale, subjects.existingIds]);
	const detailRef = useRef<HTMLElement>(null);

	// The detail opens above the table, so it has to be scrolled into view.
	useScrollIntoViewWhen(detailRef, selectedAnalysisId);

	function handleRowClick(analysis: AiAnalysis): void {
		if (selectedAnalysisId === analysis.id) {
			clearSelection();

			return;
		}

		openAnalysis(analysis.id);
	}

	function handleCloseDetail(): void {
		clearSelection();
	}

	function handleScopeChange(scope: ScopeFilter): void {
		setFilter({ scope, subjectId: null });
	}

	function handleSubjectChange(subjectId: string | null): void {
		setFilter((current) => ({ ...current, subjectId }));
	}

	const pickerScope = subjectScopeOf(filter.scope);

	const header = (
		<PageHeader title={t('aiAnalysis.pageTitle')} desc={t('aiAnalysis.pageDesc')}>
			<FilterAnalyzeButton filter={filter} />
		</PageHeader>
	);

	if (loadState.status === LOAD_STATUS.error) {
		return (
			<div className="page" data-page="ai">
				{header}
				<div className="error-state">{loadState.message}</div>
			</div>
		);
	}

	if (loadState.status === LOAD_STATUS.loading) {
		return (
			<div className="page" data-page="ai">
				{header}
				<DashboardSkeleton pageName="ai" hasBannerFooter cards={buildSkeletonCards(t, columns)} />
			</div>
		);
	}

	const analyses = loadState.items;
	const latest = analyses[0];
	const { totalCount, subjectCount, highRiskCount } = toAnalysisTotals(summaryState, analyses);
	const selectedAnalysis = analyses.find((analysis) => analysis.id === selectedAnalysisId);

	return (
		<div className="page" data-page="ai">
			{header}

			<section className="dashboard-hero" data-section="ai-hero">
				<div className="dashboard-span-3" data-card="ai-hero-banner">
					<StatusIntro
						name="ai-hero-intro"
						tone={latest === undefined ? 'info' : RISK_TONE[latest.riskLevel]}
						icon={<Sparkles size={20} />}
						eyebrow={t('aiAnalysis.intro.eyebrow')}
						title={latest === undefined ? t('aiAnalysis.intro.none') : t('aiAnalysis.intro.latest', { subject: analysisSubjectLabel(latest, t) })}
						description={latest === undefined ? t('aiAnalysis.intro.noneDesc') : latest.summary}
						footer={
							<span className="status-intro-footer-item">
								<span className="badge badge-muted mono">{latest?.model ?? t('aiAnalysis.intro.modelUnknown')}</span>
								{t('aiAnalysis.intro.modelDesc')}
							</span>
						}
					/>
				</div>
				<StatusIntro
					name="ai-count-tile"
					layout="tile"
					tone="info"
					icon={<Sparkles size={16} />}
					eyebrow={t('aiAnalysis.tiles.count')}
					figure={totalCount}
					title={t('aiAnalysis.tiles.countTitle', { count: totalCount })}
					description={t('aiAnalysis.tiles.countDesc')}
				/>
				<StatusIntro
					name="ai-subjects-tile"
					layout="tile"
					tone="info"
					icon={<Building2 size={16} />}
					eyebrow={t('aiAnalysis.tiles.subjects')}
					figure={subjectCount}
					title={t('aiAnalysis.tiles.subjectsTitle', { count: subjectCount })}
					description={t('aiAnalysis.tiles.subjectsDesc')}
				/>
				<StatusIntro
					name="ai-high-risk-tile"
					layout="tile"
					tone={highRiskCount > 0 ? 'danger' : 'healthy'}
					icon={<AlertTriangle size={16} />}
					eyebrow={t('aiAnalysis.tiles.highRisk')}
					figure={highRiskCount}
					title={t('aiAnalysis.tiles.highRiskTitle', { count: highRiskCount })}
					description={t('aiAnalysis.tiles.highRiskDesc')}
				/>
			</section>

			{selectedAnalysis && (
				<section ref={detailRef} className="ai-analyses-detail" data-section="ai-detail">
					<AiAnalysisCard analysis={selectedAnalysis} name="ai-selected-analysis" onClose={handleCloseDetail} />
				</section>
			)}

			<section className="dashboard-grid" data-section="ai-grid">
				<DashboardCard
					name="ai-analyses-table"
					span={6}
					title={t('aiAnalysis.tables.history')}
					note={
						<span className="ai-analyses-filter-bar">
							<ScopeFilters value={filter.scope} onChange={handleScopeChange} />
							{pickerScope && (
								<AnalysisSubjectPicker
									scope={pickerScope}
									subjects={subjects.byScope[pickerScope]}
									value={filter.subjectId}
									onChange={handleSubjectChange}
								/>
							)}
						</span>
					}
					content="table"
				>
					<DataTable
						rows={analyses}
						rowKey={(row) => row.id}
						columns={columns}
						empty={t('aiAnalysis.empty')}
						onRowClick={handleRowClick}
						selectedRowKey={selectedAnalysisId ?? undefined}
					/>
					<LoadMoreFooter loadedCount={analyses.length} hasMore={loadState.hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
				</DashboardCard>
			</section>
		</div>
	);
}

function buildColumns(t: TFunction, locale: string, existingSubjectIds: ReadonlySet<string> | null): readonly DataTableColumn<AiAnalysis>[] {
	return [
		{
			key: 'subject',
			label: t('aiAnalysis.columns.subject'),
			isSortable: true,
			sortValue: (row) => analysisSubjectLabel(row, t),
			cell: (row) => (
				<div className="stack">
					<span className="cell-strong">{describeAnalysisSubject(row, t, existingSubjectIds)}</span>
					<span className="cell-sub">{t(`aiAnalysis.scope.${row.scope}`)}</span>
				</div>
			),
		},
		{
			key: 'risk',
			label: t('aiAnalysis.columns.risk'),
			isSortable: true,
			sortValue: (row) => row.riskLevel,
			cell: (row) => <StatusBadge status={RISK_STATUS[row.riskLevel]} label={t(`aiAnalysis.risk.${row.riskLevel}`)} />,
		},
		{ key: 'summary', label: t('aiAnalysis.columns.summary'), cell: (row) => <span className="ai-analyses-summary-cell">{row.summary}</span> },
		{
			key: 'requestedAt',
			label: t('aiAnalysis.columns.requestedAt'),
			isSortable: true,
			sortValue: (row) => row.requestedAt,
			cell: (row) => <span className="metric-value">{formatDateTime(row.requestedAt, locale)}</span>,
		},
	];
}

function buildSkeletonCards(t: TFunction, columns: readonly DataTableColumn<AiAnalysis>[]): readonly DashboardSkeletonCard[] {
	return [
		{
			name: 'ai-analyses-table',
			span: 6,
			title: t('aiAnalysis.tables.history'),
			content: 'table',
			columns,
			rowCount: SKELETON_ROWS,
			hasTwoLineLeadCell: true,
		},
	];
}

function FilterAnalyzeButton({ filter }: FilterAnalyzeButtonProps): ReactElement {
	const subjectScope = subjectScopeOf(filter.scope);

	if (subjectScope === null || filter.subjectId === null) {
		return <AnalyzeButton scope="platform" />;
	}

	return <AnalyzeButton scope={subjectScope} subjectId={filter.subjectId} />;
}
