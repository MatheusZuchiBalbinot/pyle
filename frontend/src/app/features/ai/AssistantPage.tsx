import type { TFunction } from 'i18next';
import { ArrowUp, Bot, RotateCcw, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { useTypewriter } from '@/app/hooks/useTypewriter';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';
import { MarkdownText } from '@/app/ui/MarkdownText/MarkdownText';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import { AssistantProposalCard } from './components/AssistantProposalCard/AssistantProposalCard';
import { toProposalKey, useAssistantChat, type ChatEntry, type ProposalOutcome } from './hooks/useAssistantChat';

import './AssistantPage.css';

type AssistantReplyEntry = Extract<ChatEntry, { kind: 'assistant' }>;

type BubbleTextProps = {
	readonly text: string;
	readonly isTyping: boolean;
};

type AssistantEntryProps = {
	readonly entry: AssistantReplyEntry;
	readonly isLatest: boolean;
	readonly onOutcome: (proposalKey: string, outcome: ProposalOutcome) => void;
	readonly onGrow: () => void;
};

type EmptyStateProps = {
	readonly onPick: (prompt: string) => void;
};

// The composer's own cap, well under the API's per-message limit.
const MAX_DRAFT_LENGTH = 4000;
const EXAMPLE_PROMPT_KEYS = [
	'assistant.examples.latency',
	'assistant.examples.instances',
	'assistant.examples.rateLimited',
	'assistant.examples.weights',
] as const;

export function AssistantPage(): ReactElement {
	const { t } = useTranslation();
	const { entries, status, send, reset, recordOutcome, latestReplyId } = useAssistantChat();
	const [draft, setDraft] = useState('');
	const threadRef = useRef<HTMLOListElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const isThinking = status.status === 'thinking';
	const canSend = !isThinking && draft.trim().length > 0;
	const isEmpty = entries.length === 0 && !isThinking;
	const isResetDisabled = entries.length === 0 || isThinking;

	const scrollToBottom = useCallback(() => {
		threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
	}, []);

	useEffect(() => {
		scrollToBottom();
	}, [entries.length, isThinking, scrollToBottom]);

	async function submit(text: string): Promise<void> {
		setDraft('');
		const isSent = await send(text);

		if (!isSent) {
			setDraft(text);
		}

		inputRef.current?.focus();
	}

	function submitDraft(): void {
		if (!canSend) {
			return;
		}

		void submit(draft.trim());
	}

	function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>): void {
		setDraft(event.target.value);
	}

	function handleSubmit(event: FormEvent): void {
		event.preventDefault();
		submitDraft();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		const isPlainEnter = event.key === 'Enter' && !event.shiftKey;

		if (!isPlainEnter) {
			return;
		}

		event.preventDefault();
		submitDraft();
	}

	function handleExamplePick(prompt: string): void {
		setDraft(prompt);
		inputRef.current?.focus();
	}

	function handleReset(): void {
		reset();
		setDraft('');
	}

	function renderEntry(entry: ChatEntry): ReactElement {
		if (entry.kind === 'assistant') {
			const isLatest = entry.id === latestReplyId;

			return <AssistantEntry key={entry.id} entry={entry} isLatest={isLatest} onOutcome={recordOutcome} onGrow={scrollToBottom} />;
		}

		return (
			<li key={entry.id} className="assistant-row is-operator">
				<div className="assistant-bubble">
					<p className="assistant-bubble-text">{entry.content}</p>
				</div>
			</li>
		);
	}

	return (
		<div className="page" data-page="assistant">
			<PageHeader title={t('assistant.pageTitle')} desc={t('assistant.pageDesc')}>
				<Button onClick={handleReset} disabled={isResetDisabled} data-tooltip={t('assistant.resetTooltip')}>
					<RotateCcw size={14} aria-hidden="true" />
					{t('assistant.reset')}
				</Button>
			</PageHeader>

			<section className="assistant-panel" data-card="assistant-chat">
				{isEmpty ? (
					<EmptyState onPick={handleExamplePick} />
				) : (
					<ol className="assistant-thread" ref={threadRef}>
						{entries.map(renderEntry)}
						{isThinking && <ThinkingEntry />}
					</ol>
				)}
				{status.status === 'error' && <p className="error-state assistant-error">{status.message}</p>}
				<form className="assistant-composer" onSubmit={handleSubmit}>
					<textarea
						ref={inputRef}
						className="assistant-input"
						value={draft}
						onChange={handleDraftChange}
						onKeyDown={handleKeyDown}
						placeholder={t('assistant.placeholder')}
						rows={1}
						maxLength={MAX_DRAFT_LENGTH}
						disabled={isThinking}
						aria-label={t('assistant.inputLabel')}
					/>
					<IconButton type="submit" className="assistant-send" disabled={!canSend} label={t('assistant.sendTooltip')}>
						<ArrowUp size={16} aria-hidden="true" />
					</IconButton>
				</form>
				<p className="assistant-disclaimer">{t('assistant.disclaimer')}</p>
			</section>
		</div>
	);
}

function describeToolCalls(toolCalls: readonly string[], t: TFunction): string {
	const uniqueTools = [...new Set(toolCalls)];
	const labels = uniqueTools.map((tool) => t(`assistant.tools.${tool}`, { defaultValue: tool }));

	return t('assistant.consulted', { tools: labels.join(', ') });
}

function BubbleText({ text, isTyping }: BubbleTextProps): ReactElement {
	return (
		<div className="assistant-bubble-text">
			<MarkdownText text={text} />
			{isTyping && <span className="assistant-caret" aria-hidden="true" />}
		</div>
	);
}

function AssistantAvatar(): ReactElement {
	return (
		<span className="assistant-avatar" aria-hidden="true">
			<Bot size={14} />
		</span>
	);
}

// Cards appear once the text is complete, so they do not jump around under it.
function AssistantEntry({ entry, isLatest, onOutcome, onGrow }: AssistantEntryProps): ReactElement {
	const { t } = useTranslation();
	const { visibleText, isTyping } = useTypewriter(entry.content, isLatest);
	const hasText = entry.content.trim().length > 0;
	const isDetailShown = !isTyping;

	useEffect(() => {
		onGrow();
	}, [visibleText, isDetailShown, onGrow]);

	return (
		<li className="assistant-row is-assistant">
			<AssistantAvatar />
			<div className="assistant-bubble">
				{hasText && <BubbleText text={visibleText} isTyping={isTyping} />}
				{isDetailShown && entry.toolCalls.length > 0 && <span className="assistant-tools">{describeToolCalls(entry.toolCalls, t)}</span>}
				{isDetailShown && entry.proposals.length > 0 && (
					<div className="assistant-proposals">
						{entry.proposals.map((proposal, index) => {
							const proposalKey = toProposalKey(entry.id, index);

							function handleOutcome(outcome: ProposalOutcome): void {
								onOutcome(proposalKey, outcome);
							}

							return <AssistantProposalCard key={proposalKey} proposal={proposal} onOutcome={handleOutcome} />;
						})}
					</div>
				)}
			</div>
		</li>
	);
}

function ThinkingEntry(): ReactElement {
	const { t } = useTranslation();

	return (
		<li className="assistant-row is-assistant is-thinking" aria-live="polite">
			<AssistantAvatar />
			<div className="assistant-bubble">
				<Skeleton width="220px" height="10px" />
				<Skeleton width="140px" height="10px" />
				<span className="assistant-status">
					<span className="assistant-dots" aria-hidden="true">
						<span />
						<span />
						<span />
					</span>
					{t('assistant.thinking')}
				</span>
			</div>
		</li>
	);
}

function EmptyState({ onPick }: EmptyStateProps): ReactElement {
	const { t } = useTranslation();

	return (
		<div className="assistant-empty">
			<span className="assistant-empty-icon" aria-hidden="true">
				<Sparkles size={18} />
			</span>
			<div>
				<p className="assistant-empty-title">{t('assistant.empty.title')}</p>
				<p className="assistant-empty-desc">{t('assistant.empty.desc')}</p>
			</div>
			<div className="assistant-examples">
				{EXAMPLE_PROMPT_KEYS.map((key) => {
					const prompt = t(key);

					function handlePick(): void {
						onPick(prompt);
					}

					return (
						<Button key={key} variant="pill" onClick={handlePick} data-tooltip={t('assistant.examples.tooltip')}>
							{prompt}
						</Button>
					);
				})}
			</div>
		</div>
	);
}
