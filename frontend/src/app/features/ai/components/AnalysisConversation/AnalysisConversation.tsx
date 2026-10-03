import { MessageSquareText, SendHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { AiAnalysisMessage } from '@/app/api/adminApiTypes';
import { useAnalysisConversation, type PendingTurn } from '@/app/features/ai/hooks/useAnalysisConversation';
import { formatDateTime } from '@/app/lib/format';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { MarkdownText } from '@/app/ui/MarkdownText/MarkdownText';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import './AnalysisConversation.css';

type AnalysisConversationProps = {
	readonly analysisId: string;
};

type MessageBubbleProps = {
	readonly author: AiAnalysisMessage['role'];
	readonly content: string;
	readonly footer?: string;
};

// Enter sends, Shift+Enter breaks a line.
export function AnalysisConversation({ analysisId }: AnalysisConversationProps): ReactElement {
	const { t, i18n } = useTranslation();
	const { loadState, pendingTurn, errorMessage, ask } = useAnalysisConversation(analysisId);
	const [draft, setDraft] = useState('');
	const listRef = useRef<HTMLOListElement>(null);
	const isBusy = pendingTurn !== null;
	const canSend = !isBusy && draft.trim().length > 0;

	const messageCount = loadState.status === LOAD_STATUS.loaded ? loadState.data.length : 0;
	const streamedLength = pendingTurn?.partialAnswer.length ?? 0;

	useEffect(() => {
		listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
	}, [messageCount, streamedLength]);

	function submit(): void {
		if (!canSend) {
			return;
		}

		const question = draft.trim();

		setDraft('');
		void ask(question);
	}

	function handleDraftChange(event: ChangeEvent<HTMLTextAreaElement>): void {
		setDraft(event.target.value);
	}

	function handleSubmit(event: FormEvent): void {
		event.preventDefault();
		submit();
	}

	function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
		const isPlainEnter = event.key === 'Enter' && !event.shiftKey;

		if (!isPlainEnter) {
			return;
		}

		event.preventDefault();
		submit();
	}

	function renderThread(): ReactElement {
		if (loadState.status === LOAD_STATUS.loading) {
			return (
				<div className="conversation-skeleton">
					<Skeleton width="60%" height="14px" />
					<Skeleton width="85%" height="14px" />
				</div>
			);
		}

		if (loadState.status === LOAD_STATUS.error) {
			return <p className="error-state">{loadState.message}</p>;
		}

		const isEmpty = loadState.data.length === 0 && !pendingTurn;

		if (isEmpty) {
			return <p className="faint conversation-empty">{t('aiAnalysis.chat.empty')}</p>;
		}

		return (
			<ol className="conversation-list" ref={listRef}>
				{loadState.data.map((message) => (
					<MessageBubble key={message.id} author={message.role} content={message.content} footer={formatDateTime(message.createdAt, i18n.language)} />
				))}
				{pendingTurn && <PendingTurnBubbles turn={pendingTurn} />}
			</ol>
		);
	}

	return (
		<section className="analysis-conversation" aria-label={t('aiAnalysis.chat.title')} data-card="analysis-conversation">
			<h3>
				<MessageSquareText size={13} aria-hidden="true" />
				{t('aiAnalysis.chat.title')}
			</h3>
			{renderThread()}
			{errorMessage && <p className="error-state conversation-error">{errorMessage}</p>}
			<form className="conversation-form" onSubmit={handleSubmit}>
				<textarea
					className="conversation-input"
					value={draft}
					onChange={handleDraftChange}
					onKeyDown={handleKeyDown}
					placeholder={t('aiAnalysis.chat.placeholder')}
					rows={2}
					disabled={isBusy}
					aria-label={t('aiAnalysis.chat.title')}
				/>
				<Button type="submit" variant="primary" disabled={!canSend} data-tooltip={t('aiAnalysis.chat.sendTooltip')}>
					<SendHorizontal size={14} aria-hidden="true" />
					{t('aiAnalysis.chat.send')}
				</Button>
			</form>
		</section>
	);
}

function MessageBubble({ author, content, footer }: MessageBubbleProps): ReactElement {
	const { t } = useTranslation();

	return (
		<li className={`conversation-message is-${author}`}>
			<span className="conversation-message-role">{t(author === 'user' ? 'aiAnalysis.chat.you' : 'aiAnalysis.chat.assistant')}</span>
			<div className="conversation-message-text">
				<MarkdownText text={content} />
			</div>
			{footer && <span className="conversation-message-footer">{footer}</span>}
		</li>
	);
}

function PendingTurnBubbles({ turn }: { readonly turn: PendingTurn }): ReactElement {
	const { t } = useTranslation();

	function resolveStatus(): string {
		if (turn.consultingTool) {
			return t('aiAnalysis.chat.consulting', { tool: t(`aiAnalysis.chat.tools.${turn.consultingTool}`, { defaultValue: turn.consultingTool }) });
		}

		if (turn.partialAnswer.length === 0) {
			return t('aiAnalysis.chat.thinking');
		}

		return '';
	}

	const status = resolveStatus();

	return (
		<>
			<MessageBubble author="user" content={turn.question} />
			<li className="conversation-message is-assistant is-streaming">
				<span className="conversation-message-role">{t('aiAnalysis.chat.assistant')}</span>
				{turn.partialAnswer.length > 0 && (
					<div className="conversation-message-text">
						<MarkdownText text={turn.partialAnswer} />
					</div>
				)}
				{status && (
					<span className="conversation-message-status">
						<span className="conversation-pulse" aria-hidden="true" />
						{status}
					</span>
				)}
			</li>
		</>
	);
}
