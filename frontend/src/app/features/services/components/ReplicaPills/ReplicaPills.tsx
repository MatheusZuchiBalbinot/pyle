import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ServiceInstance } from '@/app/api/adminApiTypes';
import type { ReplicaOverview, ReplicaSlot, ReplicaState } from '@/app/features/services/lib/replicaSlots';
import { useNow } from '@/app/hooks/useNow';
import { assertUnreachable } from '@/app/lib/assertUnreachable';
import { formatRelativeTime } from '@/app/lib/relativeTime';

import './ReplicaPills.css';

export type ReplicaPillsProps = {
	readonly overview: ReplicaOverview;
	readonly maxManagedReplicas: number;
	readonly selectedInstanceId: string | null;
	// Opens the replica's row (state timeline and chaos) in the instance table.
	readonly onSelect: (instanceId: string) => void;
};

type ReplicaPillProps = {
	readonly instance: ServiceInstance;
	readonly state: ReplicaState;
	readonly nowMs: number;
	readonly isSelected: boolean;
	readonly onSelect: (instanceId: string) => void;
};

type OccupiedSlot = Exclude<ReplicaSlot, { readonly kind: 'free' }>;

// The ages in the tooltips only need to be roughly right.
const AGE_TICK_MS = 30_000;

// One pill per managed replica, then the free room up to the ceiling. The state is in the
// pill's shape and in its text, never in the color alone.
export function ReplicaPills({ overview, maxManagedReplicas, selectedInstanceId, onSelect }: ReplicaPillsProps): ReactElement {
	const { t } = useTranslation();
	const nowMs = useNow(AGE_TICK_MS);
	const occupiedSlots = overview.slots.filter(isOccupied);
	const occupiedCount = occupiedSlots.length;
	const freeCount = overview.slots.length - occupiedCount;
	const listLabel = t('services.scaling.listLabel', { count: occupiedCount, max: maxManagedReplicas });

	function renderSlot(slot: OccupiedSlot, index: number): ReactElement {
		if (slot.kind === 'replica') {
			const isSelected = slot.instance.id === selectedInstanceId;

			return (
				<ReplicaPill key={slot.instance.id} instance={slot.instance} state={slot.state} nowMs={nowMs} isSelected={isSelected} onSelect={onSelect} />
			);
		}

		if (slot.kind === 'requested') {
			return <RequestedPill key={`requested-${index}`} />;
		}

		return assertUnreachable(slot);
	}

	// The free room is one line of text, not a row of empty outlines that read as loading.
	return (
		<ul className="replica-pills" aria-label={listLabel}>
			{occupiedSlots.map(renderSlot)}
			{freeCount > 0 && (
				<li className="replica-free" data-tooltip={t('services.scaling.freeTooltip', { max: maxManagedReplicas })}>
					{t('services.scaling.freeSlots', { count: freeCount })}
				</li>
			)}
		</ul>
	);
}

function ReplicaPill({ instance, state, nowMs, isSelected, onSelect }: ReplicaPillProps): ReactElement {
	const { t, i18n } = useTranslation();
	const stateLabel = t(`services.scaling.state.${state}`);
	const age = formatRelativeTime(instance.createdAt, nowMs, i18n.language);
	const tooltip = t('services.scaling.replicaTooltip', { name: instance.name, state: stateLabel, url: instance.url, age });

	function handleClick(): void {
		onSelect(instance.id);
	}

	return (
		<li className="replica-slot">
			<button
				type="button"
				className="replica-pill"
				data-state={state}
				data-tooltip={tooltip}
				data-tooltip-side="top"
				aria-pressed={isSelected}
				onClick={handleClick}
			>
				<span className="sr-only">{t('services.scaling.replicaLabel', { name: instance.name, state: stateLabel })}</span>
			</button>
		</li>
	);
}

function RequestedPill(): ReactElement {
	const { t } = useTranslation();

	return (
		<li className="replica-slot">
			<span className="replica-pill" data-state="requested" data-tooltip={t('services.scaling.requestedTooltip')} data-tooltip-side="top">
				<span className="sr-only">{t('services.scaling.state.requested')}</span>
			</span>
		</li>
	);
}

function isOccupied(slot: ReplicaSlot): slot is OccupiedSlot {
	return slot.kind !== 'free';
}
