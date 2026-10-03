import { KeyRound, Pencil, Route as RouteIcon, Trash2 } from 'lucide-react';
import { useRef, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ApiKey, Consumer, Route } from '@/app/api/adminApiTypes';
import { useConsumerDetail } from '@/app/features/consumers/hooks/useConsumerDetail';
import { useScrollIntoViewWhen } from '@/app/hooks/useScrollIntoViewWhen';
import { Button } from '@/app/ui/Button/Button';
import { TypedConfirmDialog } from '@/app/ui/TypedConfirmDialog/TypedConfirmDialog';

import { ApiKeyList } from '../ApiKeyList/ApiKeyList';
import { ConsumerRoutesPicker } from '../ConsumerRoutesPicker/ConsumerRoutesPicker';
import { ConsumerUsagePanel } from '../ConsumerUsagePanel/ConsumerUsagePanel';

import '@/app/ui/DetailPanel/DetailPanel.css';
import './ConsumerDetail.css';

export type ConsumerDetailProps = {
	readonly consumer: Consumer;
	readonly routes: readonly Route[];
	readonly onEdit: (consumer: Consumer) => void;
	// A key just issued, to show once.
	readonly onKeyIssued: (consumerName: string, apiKey: string) => void;
};

export function ConsumerDetail({ consumer, routes, onEdit, onKeyIssued }: ConsumerDetailProps): ReactElement {
	const { t } = useTranslation();
	const detail = useConsumerDetail(consumer);
	const [scopeDraft, setScopeDraft] = useState<readonly string[] | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);

	useScrollIntoViewWhen(containerRef, consumer.id);
	const scope = consumer.allowedRoutes.map((route) => route.id);
	const activeKeyCount = consumer.apiKeys.filter((key) => key.revokedAt === null).length;

	async function handleIssue(label: string): Promise<void> {
		const created = await detail.issueKey(label);

		if (created) {
			onKeyIssued(consumer.name, created.key);
		}
	}

	async function handleSaveScope(): Promise<void> {
		if (scopeDraft === null) {
			return;
		}

		const isSaved = await detail.setRoutes(scopeDraft);

		if (isSaved) {
			setScopeDraft(null);
		}
	}

	function handleRevoke(key: ApiKey): void {
		void detail.revokeKey(key);
	}

	function renderPending(): ReactElement | null {
		const pending = detail.pending;

		if (pending === null) {
			return null;
		}

		return (
			<TypedConfirmDialog
				title={t('consumers.remove.title', { name: consumer.name })}
				message={t('consumers.remove.message')}
				expected={consumer.slug}
				confirmLabel={t('consumers.remove.confirm')}
				confirmTooltip={t('consumers.remove.confirmTooltip')}
				isConfirming={pending.isRunning}
				errorMessage={pending.errorMessage}
				onConfirm={() => void detail.confirmPending()}
				onCancel={detail.cancelPending}
			/>
		);
	}

	return (
		<div className="card consumer-detail" ref={containerRef} data-card="consumer-detail">
			<div className="consumer-detail-head">
				<div>
					<h2>{consumer.name}</h2>
					<span className="mono muted">{consumer.slug}</span>
				</div>
				<div className="consumer-detail-actions">
					<Button isSmall onClick={() => onEdit(consumer)} data-tooltip={t('consumers.detail.editTooltip')}>
						<Pencil size={13} aria-hidden="true" />
						{t('common.edit')}
					</Button>
					<Button isSmall variant="danger" onClick={detail.requestDelete} data-tooltip={t('consumers.detail.removeTooltip')}>
						<Trash2 size={13} aria-hidden="true" />
						{t('common.remove')}
					</Button>
				</div>
			</div>
			<ConsumerUsagePanel traffic={detail.traffic} window={detail.window} onWindowChange={detail.setWindow} />
			<div className="detail-panel">
				<section className="detail-panel-section" aria-label={t('consumers.detail.keys')}>
					<header className="detail-section-head">
						<h4>
							<KeyRound size={14} aria-hidden="true" />
							{t('consumers.detail.keys')}
						</h4>
						<span className="badge badge-muted">{t('consumers.detail.activeKeys', { count: activeKeyCount })}</span>
					</header>
					<ApiKeyList keys={consumer.apiKeys} onIssue={handleIssue} onRevoke={handleRevoke} />
				</section>
				<section className="detail-panel-section" aria-label={t('consumers.detail.scope')}>
					<header className="detail-section-head">
						<h4>
							<RouteIcon size={14} aria-hidden="true" />
							{t('consumers.detail.scope')}
						</h4>
						{scopeDraft === null ? (
							<Button isSmall variant="pill" onClick={() => setScopeDraft(scope)} data-tooltip={t('consumers.detail.editScopeTooltip')}>
								{t('consumers.detail.editScope')}
							</Button>
						) : (
							<span className="consumer-scope-actions">
								<Button isSmall variant="secondary" onClick={() => setScopeDraft(null)} data-tooltip={t('common.cancelTooltip')}>
									{t('common.cancel')}
								</Button>
								<Button isSmall variant="primary" onClick={() => void handleSaveScope()} data-tooltip={t('consumers.detail.saveScopeTooltip')}>
									{t('common.save')}
								</Button>
							</span>
						)}
					</header>
					{scopeDraft === null ? (
						<ConsumerScopeChips consumer={consumer} />
					) : (
						<ConsumerRoutesPicker routes={routes} value={scopeDraft} onChange={setScopeDraft} />
					)}
				</section>
			</div>
			{renderPending()}
		</div>
	);
}

// The routes as chips, or one chip that says every route is open, new ones included.
function ConsumerScopeChips({ consumer }: { readonly consumer: Consumer }): ReactElement {
	const { t } = useTranslation();

	if (consumer.allowedRoutes.length === 0) {
		return (
			<ul className="consumer-scope-chips">
				<li className="consumer-scope-chip is-all">{t('consumers.routes.allSummary')}</li>
			</ul>
		);
	}

	return (
		<ul className="consumer-scope-chips">
			{consumer.allowedRoutes.map((route) => (
				<li key={route.id} className="consumer-scope-chip">
					{route.name}
					<span className="mono">{route.pathPrefix}</span>
				</li>
			))}
		</ul>
	);
}
