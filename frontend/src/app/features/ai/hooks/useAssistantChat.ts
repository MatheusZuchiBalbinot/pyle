import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { AdminApiError, sendAssistantTurn } from '@/app/api/adminApiClient';
import type { AssistantMessage, AssistantProposal, AssistantTurnInput } from '@/app/api/adminApiTypes';
import { assertUnreachable } from '@/app/lib/assertUnreachable';

export type ProposalOutcome = 'confirmed' | 'dismissed' | 'failed';

export type ChatEntry =
	| { readonly kind: 'operator'; readonly id: string; readonly content: string }
	| {
			readonly kind: 'assistant';
			readonly id: string;
			readonly content: string;
			readonly proposals: readonly AssistantProposal[];
			readonly toolCalls: readonly string[];
	  };

export type ChatStatus = { readonly status: 'idle' } | { readonly status: 'thinking' } | { readonly status: 'error'; readonly message: string };

export type UseAssistantChatResult = {
	readonly entries: readonly ChatEntry[];
	readonly status: ChatStatus;
	// False when the turn failed, so the caller can give the text back.
	readonly send: (text: string) => Promise<boolean>;
	readonly reset: () => void;
	readonly recordOutcome: (proposalKey: string, outcome: ProposalOutcome) => void;
	readonly latestReplyId: string | null;
};

// Mirrors the backend's bounds: the whole conversation is resent every turn.
export const MAX_HISTORY_MESSAGES = 40;
export const MAX_MESSAGE_LENGTH = 8000;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVICE_UNAVAILABLE = 503;
// The API refuses an empty message; a reply made only of proposal cards
// still needs a body in the history.
const EMPTY_REPLY_PLACEHOLDER = '(no text)';

export function toProposalKey(entryId: string, index: number): string {
	return `${entryId}:${index}`;
}

// Starts on an operator message: providers expect the user to open a conversation.
export function buildAssistantHistory(entries: readonly ChatEntry[], outcomes: ReadonlyMap<string, ProposalOutcome>): readonly AssistantMessage[] {
	const recent = entries.slice(-MAX_HISTORY_MESSAGES).map((entry) => toHistoryMessage(entry, outcomes));
	const firstUserIndex = recent.findIndex((message) => message.role === 'user');

	if (firstUserIndex === -1) {
		return [];
	}

	return recent.slice(firstUserIndex);
}

// The API is stateless: the conversation lives here only.
export function useAssistantChat(): UseAssistantChatResult {
	const { t } = useTranslation();
	const [entries, setEntries] = useState<readonly ChatEntry[]>([]);
	const [status, setStatus] = useState<ChatStatus>({ status: 'idle' });
	const [outcomes, setOutcomes] = useState<ReadonlyMap<string, ProposalOutcome>>(new Map());
	const [latestReplyId, setLatestReplyId] = useState<string | null>(null);
	const nextIdRef = useRef(0);

	const nextId = useCallback((): string => {
		nextIdRef.current += 1;

		return String(nextIdRef.current);
	}, []);

	const toFailureMessage = useCallback(
		(error: unknown): string => {
			if (!(error instanceof AdminApiError)) {
				return t('assistant.failed');
			}

			if (error.statusCode === HTTP_TOO_MANY_REQUESTS) {
				return t('assistant.rateLimited');
			}

			if (error.statusCode === HTTP_SERVICE_UNAVAILABLE) {
				return t('assistant.notConfigured');
			}

			return error.message;
		},
		[t],
	);

	const send = useCallback(
		async (text: string): Promise<boolean> => {
			const operatorEntry: ChatEntry = { kind: 'operator', id: nextId(), content: text };
			const withQuestion = [...entries, operatorEntry];

			setEntries(withQuestion);
			setStatus({ status: 'thinking' });
			const messages = buildAssistantHistory(withQuestion, outcomes);
			const input: AssistantTurnInput = { messages, timeZone: resolveTimeZone() };

			try {
				const reply = await sendAssistantTurn(input);
				const assistantEntry: ChatEntry = {
					kind: 'assistant',
					id: nextId(),
					content: reply.reply,
					proposals: reply.proposals,
					toolCalls: reply.toolCalls,
				};

				setEntries([...withQuestion, assistantEntry]);
				setLatestReplyId(assistantEntry.id);
				setStatus({ status: 'idle' });

				return true;
			} catch (error) {
				setEntries(entries);
				setStatus({ status: 'error', message: toFailureMessage(error) });

				return false;
			}
		},
		[entries, outcomes, nextId, toFailureMessage],
	);

	const reset = useCallback((): void => {
		setEntries([]);
		setOutcomes(new Map());
		setLatestReplyId(null);
		setStatus({ status: 'idle' });
	}, []);

	const recordOutcome = useCallback((proposalKey: string, outcome: ProposalOutcome): void => {
		setOutcomes((current) => new Map(current).set(proposalKey, outcome));
	}, []);

	return { entries, status, send, reset, recordOutcome, latestReplyId };
}

function describeProposalTarget(proposal: AssistantProposal): string {
	switch (proposal.type) {
		case 'drain_instance':
		case 'enable_instance':
		case 'set_instance_weight':
		case 'set_instance_chaos':
			return proposal.instanceName;
		case 'set_lb_strategy':
		case 'set_service_timeout':
		case 'set_service_retries':
		case 'scale_service':
			return proposal.serviceSlug;
		case 'set_route_timeout':
		case 'set_route_rate_limit':
			return proposal.routeName;
		case 'set_consumer_rate_limit':
		case 'revoke_api_key':
			return proposal.consumerSlug;
		case 'create_consumer':
			return proposal.slug;
		case 'create_route':
			return proposal.pathPrefix;
		case 'update_alert_rule':
			return proposal.kind;
		case 'generate_analysis':
			return proposal.subjectName ?? 'platform';
		default:
			return assertUnreachable(proposal);
	}
}

// The model only sees text, so its proposals' fate is appended to its own message.
function toAssistantHistoryContent(entry: Extract<ChatEntry, { kind: 'assistant' }>, outcomes: ReadonlyMap<string, ProposalOutcome>): string {
	const text = entry.content.trim() || EMPTY_REPLY_PLACEHOLDER;

	if (entry.proposals.length === 0) {
		return text;
	}

	const cards = entry.proposals.map((proposal, index) => {
		const outcome = outcomes.get(toProposalKey(entry.id, index)) ?? 'awaiting confirmation';

		return `${proposal.type} ${describeProposalTarget(proposal)} → ${outcome}`;
	});

	return `${text}\n\n[Proposal cards: ${cards.join('; ')}]`;
}

function toHistoryMessage(entry: ChatEntry, outcomes: ReadonlyMap<string, ProposalOutcome>): AssistantMessage {
	if (entry.kind === 'operator') {
		return { role: 'user', content: entry.content };
	}

	const content = toAssistantHistoryContent(entry, outcomes).slice(0, MAX_MESSAGE_LENGTH);

	return { role: 'assistant', content };
}

function resolveTimeZone(): string {
	return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
