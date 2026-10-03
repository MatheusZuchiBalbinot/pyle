import type { TFunction } from 'i18next';
import { Lightbulb, Minus, Sparkles, TrendingDown, TrendingUp, X } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiAnalysis, AiTrend } from '@/app/api/adminApiTypes';
import { analysisSubjectLabel } from '@/app/features/ai/lib/analysisSubject';
import { formatDateTime } from '@/app/lib/format';
import { Button } from '@/app/ui/Button/Button';
import { InlineMarkdown } from '@/app/ui/InlineMarkdown/InlineMarkdown';
import { StatusBadge } from '@/app/ui/StatusBadge/StatusBadge';

import { AnalysisConversation } from '../AnalysisConversation/AnalysisConversation';
import { SuggestedActionsPanel } from '../SuggestedActionsPanel/SuggestedActionsPanel';
import { RISK_STATUS, RISK_TONE } from './riskTone';

import './AiAnalysisCard.css';

export type AiAnalysisCardProps = {
	readonly analysis: AiAnalysis;
	readonly name: string;
	readonly onClose?: () => void;
	// The follow-up thread; off in compact places (a row's detail panel).
	readonly hasConversation?: boolean;
};

const TREND_ICONS: Readonly<Record<AiTrend, typeof TrendingUp>> = { improved: TrendingUp, stable: Minus, worsened: TrendingDown };

const MINUTES_PER_HOUR = 60;

type TrendLineProps = { readonly trend: AiTrend; readonly summary: string | null };

export function AiAnalysisCard({ analysis, name, onClose, hasConversation = true }: AiAnalysisCardProps): ReactElement {
	const { t, i18n } = useTranslation();
	const scopeLabel = t(`aiAnalysis.scope.${analysis.scope}`);
	const windowLabel = formatWindow(analysis.windowMinutes, t);
	const subjectLabel = analysisSubjectLabel(analysis, t);

	return (
		<article
			className={`ai-analysis-card status-intro-${RISK_TONE[analysis.riskLevel]}`}
			data-card={name}
			aria-label={t('aiAnalysis.cardAriaLabel', { subject: subjectLabel })}
		>
			<header className="ai-analysis-card-header">
				<span className="ai-analysis-card-icon" aria-hidden="true">
					<Sparkles size={16} />
				</span>
				<div className="ai-analysis-card-heading">
					<p className="status-intro-eyebrow">
						{scopeLabel}
						{windowLabel && ` · ${windowLabel}`}
					</p>
					<h2>{subjectLabel}</h2>
				</div>
				<StatusBadge status={RISK_STATUS[analysis.riskLevel]} label={t(`aiAnalysis.risk.${analysis.riskLevel}`)} />
				{onClose && (
					<Button variant="row-action" onClick={onClose} data-tooltip={t('aiAnalysis.closeTooltip')}>
						<X size={14} aria-hidden="true" />
						{t('aiAnalysis.close')}
					</Button>
				)}
			</header>

			<p className="ai-analysis-card-summary">
				<InlineMarkdown text={analysis.summary} />
			</p>

			{analysis.trend && <TrendLine trend={analysis.trend} summary={analysis.trendSummary} />}

			<div className="ai-analysis-card-columns">
				<section aria-label={t('aiAnalysis.highlights')}>
					<h3>{t('aiAnalysis.highlights')}</h3>
					{analysis.highlights.length === 0 ? (
						<p className="faint">{t('aiAnalysis.noHighlights')}</p>
					) : (
						<ol className="ai-analysis-card-list">
							{analysis.highlights.map((highlight, index) => (
								<li key={index}>
									<InlineMarkdown text={highlight} />
								</li>
							))}
						</ol>
					)}
				</section>
				<section aria-label={t('aiAnalysis.recommendations')}>
					<h3>
						<Lightbulb size={13} aria-hidden="true" />
						{t('aiAnalysis.recommendations')}
					</h3>
					{analysis.recommendations.length === 0 ? (
						<p className="faint">{t('aiAnalysis.noRecommendations')}</p>
					) : (
						<ul className="ai-analysis-card-list is-recommendations">
							{analysis.recommendations.map((recommendation, index) => (
								<li key={index}>
									<InlineMarkdown text={recommendation} />
								</li>
							))}
						</ul>
					)}
				</section>
			</div>

			<SuggestedActionsPanel actions={analysis.suggestedActions} />

			{hasConversation && <AnalysisConversation analysisId={analysis.id} />}

			<footer className="ai-analysis-card-footer">
				<span className="mono">{analysis.model}</span>
				<span>{formatDateTime(analysis.requestedAt, i18n.language)}</span>
			</footer>
		</article>
	);
}

function formatWindow(minutes: number | null, t: TFunction): string | null {
	if (minutes === null) {
		return null;
	}

	const hours = minutes / MINUTES_PER_HOUR;

	if (hours >= 1) {
		return t('aiAnalysis.windowHours', { count: hours });
	}

	return t('aiAnalysis.windowMinutes', { count: minutes });
}

function TrendLine({ trend, summary }: TrendLineProps): ReactElement {
	const { t } = useTranslation();
	const Icon = TREND_ICONS[trend];

	return (
		<p className={`ai-analysis-card-trend is-${trend}`} data-tooltip={t('aiAnalysis.trend.label')}>
			<Icon size={14} aria-hidden="true" />
			<strong>{t(`aiAnalysis.trend.${trend}`)}</strong>
			{summary && (
				<span>
					· <InlineMarkdown text={summary} />
				</span>
			)}
		</p>
	);
}
