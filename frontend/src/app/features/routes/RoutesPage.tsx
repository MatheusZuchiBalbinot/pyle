import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Route } from '@/app/api/adminApiTypes';
import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';
import { TypedConfirmDialog } from '@/app/ui/TypedConfirmDialog/TypedConfirmDialog';

import { RouteDetail } from './components/RouteDetail/RouteDetail';
import { RouteForm } from './components/RouteForm/RouteForm';
import { RouteList } from './components/RouteList/RouteList';
import { RoutesSummary } from './components/RoutesSummary/RoutesSummary';
import type { RouteFormMode } from './hooks/useRouteForm';
import { useRoutesPage } from './hooks/useRoutesPage';

import './RoutesPage.css';

const SKELETON_ROWS = ['a', 'b', 'c', 'd'];

export function RoutesPage(): ReactElement {
	const { t } = useTranslation();
	const { rows, expandedRouteId, toggleRoute, deletion, requestDelete, cancelDelete, confirmDelete } = useRoutesPage();
	const services = useConfigList('services').loadState;
	const [formMode, setFormMode] = useState<RouteFormMode | null>(null);
	const serviceList = services.status === LOAD_STATUS.loaded ? services.data : [];

	function handleCreate(): void {
		setFormMode({ kind: 'create' });
	}

	function handleEdit(route: Route): void {
		setFormMode({ kind: 'edit', route });
	}

	function handleSaved(route: Route): void {
		setFormMode(null);

		if (route.id !== expandedRouteId) {
			toggleRoute(route.id);
		}
	}

	function closeForm(): void {
		setFormMode(null);
	}

	function renderList(): ReactElement {
		if (rows.status === LOAD_STATUS.loading) {
			return (
				<div className="card routes-skeleton">
					{SKELETON_ROWS.map((row) => (
						<Skeleton key={row} height="20px" />
					))}
				</div>
			);
		}

		if (rows.status === LOAD_STATUS.error) {
			return <div className="card error-state routes-error">{rows.message}</div>;
		}

		const expanded = rows.data.find((row) => row.route.id === expandedRouteId)?.route;

		return (
			<>
				<RoutesSummary rows={rows.data} />
				<div className="card routes-list" data-card="routes-list">
					<RouteList rows={rows.data} expandedRouteId={expandedRouteId} onToggle={toggleRoute} />
				</div>
				{expanded && <RouteDetail key={expanded.id} route={expanded} onEdit={handleEdit} onDelete={requestDelete} />}
			</>
		);
	}

	return (
		<div className="page" data-page="routes">
			<PageHeader title={t('routes.title')} desc={t('routes.desc')}>
				<Button variant="primary" onClick={handleCreate} data-tooltip={t('routes.createTooltip')}>
					<Plus size={14} aria-hidden="true" />
					{t('routes.create')}
				</Button>
			</PageHeader>
			{renderList()}
			{formMode && <RouteForm mode={formMode} services={serviceList} onSaved={handleSaved} onCancel={closeForm} />}
			{deletion && (
				<TypedConfirmDialog
					title={t('routes.delete.title', { name: deletion.route.name })}
					message={t('routes.delete.message', { prefix: deletion.route.pathPrefix })}
					expected={deletion.route.pathPrefix}
					confirmLabel={t('routes.delete.confirm')}
					confirmTooltip={t('routes.delete.confirmTooltip')}
					isConfirming={deletion.isDeleting}
					errorMessage={deletion.errorMessage}
					onConfirm={() => void confirmDelete()}
					onCancel={cancelDelete}
				/>
			)}
		</div>
	);
}
