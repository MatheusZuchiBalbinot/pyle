import { Check, Copy, KeyRound, TriangleAlert } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/app/ui/Button/Button';

import './ApiKeyReveal.css';

type ApiKeyRevealProps = {
	readonly consumerName: string;
	// Held only by the caller's local state, which drops it on acknowledge.
	readonly apiKey: string;
	readonly onAcknowledge: () => void;
};

type CopyState = 'idle' | 'copied' | 'failed';

const COPY_LABEL_KEYS: Readonly<Record<CopyState, string>> = {
	idle: 'consumers.keyReveal.copy',
	copied: 'consumers.keyReveal.copied',
	failed: 'consumers.keyReveal.copyFailed',
};

// The only time the key is visible: the server stores its hash.
export function ApiKeyReveal({ consumerName, apiKey, onAcknowledge }: ApiKeyRevealProps): ReactElement {
	const { t } = useTranslation();
	const [copyState, setCopyState] = useState<CopyState>('idle');

	async function copyKey(): Promise<void> {
		try {
			await navigator.clipboard.writeText(apiKey);
			setCopyState('copied');
		} catch {
			// Clipboard access can be denied; the key stays selectable on screen.
			setCopyState('failed');
		}
	}

	function handleCopyClick(): void {
		void copyKey();
	}

	const CopyIcon = copyState === 'copied' ? Check : Copy;

	return (
		<div className="api-key-reveal" role="group" aria-label={t('consumers.keyReveal.title', { name: consumerName })}>
			<div className="api-key-reveal-title">
				<span className="api-key-reveal-icon" aria-hidden="true">
					<KeyRound size={16} />
				</span>
				{t('consumers.keyReveal.title', { name: consumerName })}
			</div>
			<code className="api-key-reveal-key">{apiKey}</code>
			<p className="api-key-reveal-warning">
				<TriangleAlert size={14} aria-hidden="true" />
				{t('consumers.keyReveal.warning')}
			</p>
			<div className="api-key-reveal-actions">
				<Button variant="secondary" onClick={handleCopyClick} data-tooltip={t('consumers.keyReveal.copyTooltip')}>
					<CopyIcon size={12} aria-hidden="true" />
					{t(COPY_LABEL_KEYS[copyState])}
				</Button>
				<Button variant="primary" onClick={onAcknowledge} data-tooltip={t('consumers.keyReveal.acknowledgeTooltip')}>
					{t('consumers.keyReveal.acknowledge')}
				</Button>
			</div>
		</div>
	);
}
