import { Plus, Search } from 'lucide-react';
import { useState, type ChangeEvent, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Consumer } from '@/app/api/adminApiTypes';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { LoadMoreFooter } from '@/app/ui/LoadMoreFooter/LoadMoreFooter';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';
import { TextInput } from '@/app/ui/TextInput/TextInput';

import { ApiKeyReveal } from './components/ApiKeyReveal/ApiKeyReveal';
import { ConsumerDetail } from './components/ConsumerDetail/ConsumerDetail';
import { ConsumerForm } from './components/ConsumerForm/ConsumerForm';
import { ConsumerList } from './components/ConsumerList/ConsumerList';
import { ConsumersSummary } from './components/ConsumersSummary/ConsumersSummary';
import { useApiKeyReveal } from './hooks/useApiKeyReveal';
import type { ConsumerFormMode, ConsumerSaved } from './hooks/useConsumerForm';
import { useConsumersPage } from './hooks/useConsumersPage';

import './ConsumersPage.css';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

export function ConsumersPage(): ReactElement {
	const { t } = useTranslation();
	const { rows, isLoadingMore, loadMore, query, setQuery, expandedSlug, toggleConsumer } = useConsumersPage();
	const routes = useConfigList('routes').loadState;
	const routeList = routes.status === LOAD_STATUS.loaded ? routes.data : [];
	const { revealed, reveal, acknowledge } = useApiKeyReveal();
	const [formMode, setFormMode] = useState<ConsumerFormMode | null>(null);

	function handleSaved(saved: ConsumerSaved): void {
		setFormMode(null);

		if (saved.kind === 'created') {
			reveal(saved.consumer.name, saved.consumer.key);
		}
	}

	function handleQuery(event: ChangeEvent<HTMLInputElement>): void {
		setQuery(event.target.value);
	}

	function handleEdit(consumer: Consumer): void {
		setFormMode({ kind: 'edit', consumer });
	}

	function renderList(): ReactElement {
		if (rows.status === LOAD_STATUS.loading) {
			return (
				<div className="card consumers-skeleton">
					{SKELETON_ROWS.map((row) => (
						<Skeleton key={row} height="20px" />
					))}
				</div>
			);
		}

		if (rows.status === LOAD_STATUS.error) {
			return <div className="card error-state consumers-error">{rows.message}</div>;
		}

		const expanded = rows.items.find((row) => row.consumer.slug === expandedSlug)?.consumer;

		return (
			<>
				<ConsumersSummary rows={rows.items} />
				<div className="card consumers-list" data-card="consumers-list">
					<ConsumerList rows={rows.items} expandedSlug={expandedSlug} onToggle={toggleConsumer} />
					<LoadMoreFooter loadedCount={rows.items.length} hasMore={rows.hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
				</div>
				{expanded && <ConsumerDetail key={expanded.id} consumer={expanded} routes={routeList} onEdit={handleEdit} onKeyIssued={reveal} />}
			</>
		);
	}

	return (
		<div className="page" data-page="consumers">
			<PageHeader title={t('consumers.title')} desc={t('consumers.desc')}>
				<div className="consumers-toolbar">
					<TextInput
						label={t('consumers.search')}
						placeholder={t('consumers.searchPlaceholder')}
						icon={<Search size={14} />}
						value={query}
						onChange={handleQuery}
					/>
					<Button variant="primary" onClick={() => setFormMode({ kind: 'create' })} data-tooltip={t('consumers.createTooltip')}>
						<Plus size={14} aria-hidden="true" />
						{t('consumers.create')}
					</Button>
				</div>
			</PageHeader>
			{renderList()}
			{formMode && <ConsumerForm mode={formMode} routes={routeList} onSaved={handleSaved} onCancel={() => setFormMode(null)} />}
			{revealed && (
				<div className="confirm-dialog-backdrop">
					<div className="confirm-dialog key-reveal-dialog" role="dialog" aria-modal="true">
						<ApiKeyReveal consumerName={revealed.consumerName} apiKey={revealed.apiKey} onAcknowledge={acknowledge} />
					</div>
				</div>
			)}
		</div>
	);
}
