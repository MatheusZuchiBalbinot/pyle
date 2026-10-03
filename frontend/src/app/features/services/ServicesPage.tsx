import { Plus } from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { Service } from '@/app/api/adminApiTypes';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { PageHeader } from '@/app/ui/PageHeader/PageHeader';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';
import { TypedConfirmDialog } from '@/app/ui/TypedConfirmDialog/TypedConfirmDialog';

import { InstanceForm } from './components/InstanceForm/InstanceForm';
import { ServiceCard } from './components/ServiceCard/ServiceCard';
import { ServiceForm } from './components/ServiceForm/ServiceForm';
import { useServiceActions, type PendingRemoval } from './hooks/useServiceActions';
import type { ServiceFormMode } from './hooks/useServiceForm';
import { useServicesPage } from './hooks/useServicesPage';

import './ServicesPage.css';

type RemovalCopy = { readonly title: string; readonly message: string; readonly expected: string; readonly confirm: string };

const SKELETON_CARDS = ['a', 'b'];

export function ServicesPage(): ReactElement {
	const { t } = useTranslation();
	const { cards, expandedInstanceId, toggleInstance, isChaosAllowed, maxManagedReplicas, timelineOf } = useServicesPage();
	const actions = useServiceActions();
	const [formMode, setFormMode] = useState<ServiceFormMode | null>(null);
	const [instanceFormService, setInstanceFormService] = useState<Service | null>(null);

	function renderCards(): ReactElement {
		if (cards.status === LOAD_STATUS.loading) {
			return (
				<>
					{SKELETON_CARDS.map((card) => (
						<div key={card} className="card services-skeleton">
							<Skeleton height="240px" />
						</div>
					))}
				</>
			);
		}

		if (cards.status === LOAD_STATUS.error) {
			return <div className="card error-state services-error">{cards.message}</div>;
		}

		if (cards.data.length === 0) {
			return <div className="card services-empty">{t('services.empty')}</div>;
		}

		return (
			<>
				{cards.data.map(({ service, traffic }) => (
					<ServiceCard
						key={service.id}
						service={service}
						traffic={traffic}
						expandedInstanceId={expandedInstanceId}
						onToggleInstance={toggleInstance}
						isChaosAllowed={isChaosAllowed}
						maxManagedReplicas={maxManagedReplicas}
						timelineOf={timelineOf}
						actions={actions}
						onEdit={(editing) => setFormMode({ kind: 'edit', service: editing })}
						onAddInstance={setInstanceFormService}
					/>
				))}
			</>
		);
	}

	const removal = actions.removal;

	return (
		<div className="page" data-page="services">
			<PageHeader title={t('services.title')} desc={t('services.desc')}>
				<Button variant="primary" onClick={() => setFormMode({ kind: 'create' })} data-tooltip={t('services.createTooltip')}>
					<Plus size={14} aria-hidden="true" />
					{t('services.create')}
				</Button>
			</PageHeader>
			{renderCards()}
			{formMode && <ServiceForm mode={formMode} onSaved={() => setFormMode(null)} onCancel={() => setFormMode(null)} />}
			{instanceFormService && (
				<InstanceForm service={instanceFormService} onSaved={() => setInstanceFormService(null)} onCancel={() => setInstanceFormService(null)} />
			)}
			{removal && <RemovalDialog actions={{ ...actions, removal }} />}
		</div>
	);
}

function useRemovalCopy(removal: PendingRemoval): RemovalCopy {
	const { t } = useTranslation();

	if (removal.kind === 'instance') {
		const instance = removal.instance.name;

		return {
			title: t('services.remove.instanceTitle', { instance }),
			message: t('services.remove.instanceMessage', { instance }),
			expected: instance,
			confirm: t('services.remove.instanceConfirm'),
		};
	}

	const service = removal.service;

	return {
		title: t('services.remove.serviceTitle', { service: service.name }),
		message: t('services.remove.serviceMessage'),
		expected: service.slug,
		confirm: t('services.remove.serviceConfirm'),
	};
}

function RemovalDialog({ actions }: { readonly actions: ReturnType<typeof useServiceActions> & { readonly removal: PendingRemoval } }): ReactElement {
	const { t } = useTranslation();
	const copy = useRemovalCopy(actions.removal);

	return (
		<TypedConfirmDialog
			title={copy.title}
			message={copy.message}
			expected={copy.expected}
			confirmLabel={copy.confirm}
			confirmTooltip={t('services.remove.confirmTooltip')}
			isConfirming={actions.removal.isRemoving}
			errorMessage={actions.removal.errorMessage}
			onConfirm={() => void actions.confirmRemoval()}
			onCancel={actions.cancelRemoval}
		/>
	);
}
