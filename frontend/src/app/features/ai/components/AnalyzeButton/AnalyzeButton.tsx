import { Sparkles } from 'lucide-react';
import { useMemo, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiAnalysisScope, GenerateAiAnalysisInput } from '@/app/api/adminApiTypes';
import { useGenerateAnalysis } from '@/app/features/ai/hooks/useGenerateAnalysis';
import { Button } from '@/app/ui/Button/Button';

import './AnalyzeButton.css';

export type AnalyzeButtonProps = {
	readonly scope: AiAnalysisScope;
	// Route or service id; omitted for the platform scope.
	readonly subjectId?: string;
	readonly windowMinutes?: number;
	readonly isCompact?: boolean;
};

export function AnalyzeButton({ scope, subjectId, windowMinutes, isCompact = false }: AnalyzeButtonProps): ReactElement {
	const { t } = useTranslation();
	const input = useMemo<GenerateAiAnalysisInput>(() => ({ scope, subjectId, windowMinutes }), [scope, subjectId, windowMinutes]);
	const { state, generate } = useGenerateAnalysis(input);
	const isGenerating = state.status === 'generating';

	function handleClick(): void {
		void generate();
	}

	const className = `analyze-button ${isCompact ? 'is-compact' : ''} ${isGenerating ? 'is-generating' : ''}`.trim();
	const label = isGenerating ? t('aiAnalysis.generating') : t('aiAnalysis.analyze');

	return (
		<Button
			className={className}
			onClick={handleClick}
			disabled={isGenerating}
			aria-busy={isGenerating}
			data-tooltip={t(`aiAnalysis.tooltip.${scope}`)}
		>
			<span className="analyze-button-icon" aria-hidden="true">
				<Sparkles size={isCompact ? 13 : 15} />
			</span>
			{label}
		</Button>
	);
}
