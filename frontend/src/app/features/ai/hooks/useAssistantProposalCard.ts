import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError } from '@/app/api/adminApiClient';
import type { AssistantProposal } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

import { typedConfirmationFor } from '../lib/assistantProposalLabels';
import type { ProposalOutcome } from './useAssistantChat';
import { useAssistantProposalRunner, type ProposalRunResult } from './useAssistantProposalRunner';

// The API key lives only here, and only until acknowledged.
export type ProposalCardPhase =
	| { readonly phase: 'pending' }
	| { readonly phase: 'running' }
	| { readonly phase: 'done' }
	| { readonly phase: 'created'; readonly consumerName: string; readonly apiKey: string }
	| { readonly phase: 'analysis'; readonly analysisId: string }
	| { readonly phase: 'dismissed' }
	| { readonly phase: 'failed'; readonly message: string };

export type UseAssistantProposalCardResult = {
	readonly cardPhase: ProposalCardPhase;
	readonly typedConfirmation: string;
	readonly setTypedConfirmation: (value: string) => void;
	readonly isDestructive: boolean;
	readonly confirmationText: string | null;
	readonly canConfirm: boolean;
	readonly confirm: () => Promise<void>;
	readonly dismiss: () => void;
	readonly acknowledgeApiKey: () => void;
	readonly openCreatedAnalysis: () => void;
};

const HTTP_CONFLICT = 409;

// Nothing runs until confirm(); every outcome is reported so the next turn tells the model.
export function useAssistantProposalCard(proposal: AssistantProposal, onOutcome: (outcome: ProposalOutcome) => void): UseAssistantProposalCardResult {
	const { t } = useTranslation();
	const { openAnalysis } = useGateway();
	const { execute } = useAssistantProposalRunner();
	const [cardPhase, setCardPhase] = useState<ProposalCardPhase>({ phase: 'pending' });
	const [typedConfirmation, setTypedConfirmation] = useState('');

	const confirmationText = typedConfirmationFor(proposal);
	const isDestructive = confirmationText !== null;
	const isTypedConfirmationMissing = isDestructive && typedConfirmation !== confirmationText;
	const canConfirm = cardPhase.phase !== 'running' && !isTypedConfirmationMissing;

	function toFailureMessage(error: unknown): string {
		if (!(error instanceof AdminApiError)) {
			return t('common.unexpectedError');
		}

		const isAnalysisCooldown = proposal.type === 'generate_analysis' && error.statusCode === HTTP_CONFLICT;

		if (isAnalysisCooldown) {
			return t('aiAnalysis.cooldown');
		}

		return error.message;
	}

	async function confirm(): Promise<void> {
		if (!canConfirm) {
			return;
		}

		setCardPhase({ phase: 'running' });

		try {
			const result = await execute(proposal);

			setCardPhase(toResultPhase(result));
			onOutcome('confirmed');
		} catch (error) {
			if (!(error instanceof AdminApiError)) {
				console.error(error);
			}

			setCardPhase({ phase: 'failed', message: toFailureMessage(error) });
			onOutcome('failed');
		}
	}

	function dismiss(): void {
		setCardPhase({ phase: 'dismissed' });
		onOutcome('dismissed');
	}

	function acknowledgeApiKey(): void {
		setCardPhase({ phase: 'done' });
	}

	function openCreatedAnalysis(): void {
		if (cardPhase.phase !== 'analysis') {
			return;
		}

		openAnalysis(cardPhase.analysisId);
	}

	return {
		cardPhase,
		typedConfirmation,
		setTypedConfirmation,
		isDestructive,
		confirmationText,
		canConfirm,
		confirm,
		dismiss,
		acknowledgeApiKey,
		openCreatedAnalysis,
	};
}

function toResultPhase(result: ProposalRunResult): ProposalCardPhase {
	switch (result.kind) {
		case 'done':
			return { phase: 'done' };
		case 'consumer_created':
			return { phase: 'created', consumerName: result.consumerName, apiKey: result.apiKey };
		case 'analysis_ready':
			return { phase: 'analysis', analysisId: result.analysisId };
		default:
			return assertUnreachable(result);
	}
}
