import { KeyRound, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent, type FormEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ApiKey } from '@/app/api/adminApiTypes';
import { useNow } from '@/app/hooks/useNow';
import { formatRelativeTime } from '@/app/lib/relativeTime';
import { Button } from '@/app/ui/Button/Button';
import { IconButton } from '@/app/ui/IconButton/IconButton';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import './ApiKeyList.css';

const CLOCK_MS = 30_000;

export type ApiKeyListProps = {
	readonly keys: readonly ApiKey[];
	readonly onIssue: (label: string) => Promise<void>;
	readonly onRevoke: (key: ApiKey) => void;
};

type KeyRowProps = { readonly apiKey: ApiKey; readonly nowMs: number; readonly onRevoke: (key: ApiKey) => void };

export function ApiKeyList({ keys, onIssue, onRevoke }: ApiKeyListProps): ReactElement {
	const { t } = useTranslation();
	const nowMs = useNow(CLOCK_MS);
	const [label, setLabel] = useState('');
	const [isIssuing, setIsIssuing] = useState(false);

	async function handleIssue(event: FormEvent<HTMLFormElement>): Promise<void> {
		event.preventDefault();
		setIsIssuing(true);
		await onIssue(label);
		setIsIssuing(false);
		setLabel('');
	}

	function handleLabel(event: ChangeEvent<HTMLInputElement>): void {
		setLabel(event.target.value);
	}

	return (
		<div className="api-keys">
			<ul className="api-key-list">
				{keys.map((apiKey) => (
					<KeyRow key={apiKey.id} apiKey={apiKey} nowMs={nowMs} onRevoke={onRevoke} />
				))}
			</ul>
			<form className="api-key-issue" onSubmit={(event) => void handleIssue(event)}>
				<TextInput label={t('consumers.keys.label')} placeholder={t('consumers.keys.labelPlaceholder')} value={label} onChange={handleLabel} />
				<Button type="submit" isSmall disabled={isIssuing} data-tooltip={t('consumers.keys.issueTooltip')}>
					{t('consumers.keys.issue')}
				</Button>
			</form>
		</div>
	);
}

function KeyRow({ apiKey, nowMs, onRevoke }: KeyRowProps): ReactElement {
	const { t, i18n } = useTranslation();
	const isRevoked = apiKey.revokedAt !== null;
	const lastUsed = apiKey.lastUsedAt === null ? t('consumers.keys.neverUsed') : formatRelativeTime(apiKey.lastUsedAt, nowMs, i18n.language);

	function handleRevoke(): void {
		onRevoke(apiKey);
	}

	return (
		<li className={`api-key-row ${isRevoked ? 'is-revoked' : ''}`}>
			<KeyRound size={14} aria-hidden="true" />
			<span className="mono api-key-prefix">{apiKey.keyPrefix}…</span>
			<span className="api-key-label">{apiKey.label ?? t('consumers.keys.noLabel')}</span>
			<span className="api-key-meta">{t('consumers.keys.created', { ago: formatRelativeTime(apiKey.createdAt, nowMs, i18n.language) })}</span>
			<span className="api-key-meta">{t('consumers.keys.lastUsed', { ago: lastUsed })}</span>
			{isRevoked ? (
				<span className="badge badge-muted">{t('consumers.keys.revoked')}</span>
			) : (
				<IconButton className="is-destructive" label={t('consumers.keys.revokeTooltip', { prefix: apiKey.keyPrefix })} onClick={handleRevoke}>
					<Trash2 size={14} />
				</IconButton>
			)}
		</li>
	);
}
