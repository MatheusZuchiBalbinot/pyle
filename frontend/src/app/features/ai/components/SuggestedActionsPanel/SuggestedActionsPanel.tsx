import { Wand2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { SuggestedAction } from '@/app/api/adminApiTypes';

import { AssistantProposalCard } from '../AssistantProposalCard/AssistantProposalCard';

import './SuggestedActionsPanel.css';

type SuggestedActionsPanelProps = {
	readonly actions: readonly SuggestedAction[];
};

export function SuggestedActionsPanel({ actions }: SuggestedActionsPanelProps): ReactElement | null {
	const { t } = useTranslation();

	if (actions.length === 0) {
		return null;
	}

	return (
		<section className="suggested-actions" aria-label={t('aiAnalysis.actions.title')}>
			<h3>
				<Wand2 size={13} aria-hidden="true" />
				{t('aiAnalysis.actions.title')}
			</h3>
			<div className="suggested-actions-list">
				{actions.map((action, index) => (
					<AssistantProposalCard key={`${action.type}-${index}`} proposal={action} onOutcome={ignoreOutcome} />
				))}
			</div>
		</section>
	);
}

// Outcomes only matter to the assistant's chat.
function ignoreOutcome(): void {}
