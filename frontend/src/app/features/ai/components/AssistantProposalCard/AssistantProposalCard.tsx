import { Check, ExternalLink, Play, RotateCcw, X } from 'lucide-react';
import type { ChangeEvent, ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AssistantProposal } from '@/app/api/adminApiTypes';
import type { ProposalOutcome } from '@/app/features/ai/hooks/useAssistantChat';
import { useAssistantProposalCard } from '@/app/features/ai/hooks/useAssistantProposalCard';
import { describeProposal } from '@/app/features/ai/lib/assistantProposalLabels';
import { ApiKeyReveal } from '@/app/features/consumers/components/ApiKeyReveal/ApiKeyReveal';
import { assertUnreachable } from '@/app/lib/assertUnreachable';
import { Button } from '@/app/ui/Button/Button';
import { StatusBadge } from '@/app/ui/StatusBadge/StatusBadge';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import './AssistantProposalCard.css';

type AssistantProposalCardProps = {
	readonly proposal: AssistantProposal;
	readonly onOutcome: (outcome: ProposalOutcome) => void;
};

export function AssistantProposalCard({ proposal, onOutcome }: AssistantProposalCardProps): ReactElement {
	const { t } = useTranslation();
	const card = useAssistantProposalCard(proposal, onOutcome);
	const { cardPhase } = card;
	const isRunning = cardPhase.phase === 'running';

	function handleConfirmClick(): void {
		void card.confirm();
	}

	function handleTypedConfirmationChange(event: ChangeEvent<HTMLInputElement>): void {
		card.setTypedConfirmation(event.target.value);
	}

	function renderDecision(): ReactElement {
		return (
			<>
				{card.isDestructive && (
					<TextInput
						label={t('assistant.card.typeConfirmation', { text: card.confirmationText })}
						isLabelVisible
						value={card.typedConfirmation}
						onChange={handleTypedConfirmationChange}
						disabled={isRunning}
					/>
				)}
				<div className="assistant-proposal-actions">
					<Button
						variant={card.isDestructive ? 'danger' : 'primary'}
						onClick={handleConfirmClick}
						disabled={!card.canConfirm}
						data-tooltip={t('assistant.card.confirmTooltip')}
					>
						<Play size={12} aria-hidden="true" />
						{isRunning ? t('assistant.card.running') : t('assistant.card.confirm')}
					</Button>
					<Button variant="secondary" onClick={card.dismiss} disabled={isRunning} data-tooltip={t('assistant.card.dismissTooltip')}>
						<X size={12} aria-hidden="true" />
						{t('assistant.card.dismiss')}
					</Button>
				</div>
			</>
		);
	}

	function renderState(): ReactElement {
		switch (cardPhase.phase) {
			case 'pending':
			case 'running':
				return renderDecision();
			case 'failed':
				return (
					<div className="assistant-proposal-failure">
						<p className="error-state">{t('assistant.card.failed', { message: cardPhase.message })}</p>
						<Button variant="secondary" onClick={handleConfirmClick} data-tooltip={t('assistant.card.retryTooltip')}>
							<RotateCcw size={12} aria-hidden="true" />
							{t('assistant.card.retry')}
						</Button>
					</div>
				);
			case 'created':
				return <ApiKeyReveal consumerName={cardPhase.consumerName} apiKey={cardPhase.apiKey} onAcknowledge={card.acknowledgeApiKey} />;
			case 'analysis':
				return (
					<div className="assistant-proposal-actions">
						<StatusBadge status="ready" label={t('assistant.card.analysisReady')} />
						<Button variant="secondary" onClick={card.openCreatedAnalysis} data-tooltip={t('assistant.card.openAnalysisTooltip')}>
							<ExternalLink size={12} aria-hidden="true" />
							{t('assistant.card.openAnalysis')}
						</Button>
					</div>
				);
			case 'done':
				return (
					<span className="assistant-proposal-outcome">
						<Check size={13} aria-hidden="true" />
						{t('assistant.card.done')}
					</span>
				);
			case 'dismissed':
				return <StatusBadge status="disabled" label={t('assistant.card.dismissed')} />;
			default:
				return assertUnreachable(cardPhase);
		}
	}

	return (
		<article
			className={`assistant-proposal is-${cardPhase.phase} ${card.isDestructive ? 'is-destructive' : ''}`.trim()}
			data-proposal-type={proposal.type}
		>
			<div className="assistant-proposal-text">
				<span className="assistant-proposal-label">{describeProposal(proposal, t)}</span>
				<span className="assistant-proposal-reason">{proposal.reason}</span>
			</div>
			{renderState()}
		</article>
	);
}
