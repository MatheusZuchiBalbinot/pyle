import { CirclePause, CirclePlay, FlaskConical, Trash2 } from 'lucide-react';
import { useState, type ChangeEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import type { InstanceTraffic, Service, ServiceInstance } from '@/app/api/adminApiTypes';
import { isChaosActive } from '@/app/features/services/hooks/useInstanceChaos';
import type { ServiceActions } from '@/app/features/services/hooks/useServiceActions';
import { formatLatency, formatRate } from '@/app/lib/formatTraffic';
import { toSharePercents } from '@/app/lib/sharePercents';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';
import { IconButton } from '@/app/ui/IconButton/IconButton';

import { InstanceStateBadge } from '../InstanceStateBadge/InstanceStateBadge';

import './InstanceTable.css';

const MIN_WEIGHT = 1;
const MAX_WEIGHT = 100;
const NO_VALUE = '-';

export type InstanceTableProps = {
	readonly service: Service;
	readonly traffic: readonly InstanceTraffic[] | null;
	readonly expandedInstanceId: string | null;
	readonly onToggle: (instanceId: string) => void;
	readonly actions: ServiceActions;
};

type InstanceRow = { readonly instance: ServiceInstance; readonly traffic: InstanceTraffic | null; readonly sharePercent: number | null };

// The managed replicas sit after the static instances, under a header row of their own.
type TableRow = ({ readonly kind: 'instance' } & InstanceRow) | { readonly kind: 'group'; readonly label: string };

type RowProps = { readonly service: Service; readonly instance: ServiceInstance; readonly actions: ServiceActions };

export function InstanceTable({ service, traffic, expandedInstanceId, onToggle, actions }: InstanceTableProps): ReactElement {
	const { t } = useTranslation();
	const columns: readonly DataTableColumn<InstanceRow>[] = [
		{ key: 'name', label: t('services.instances.name'), cell: (row) => <InstanceName instance={row.instance} /> },
		{ key: 'url', label: t('services.instances.url'), cell: (row) => <span className="mono instance-url">{row.instance.url}</span> },
		{ key: 'state', label: t('services.instances.state'), cell: (row) => <InstanceStateBadge instance={row.instance} /> },
		{ key: 'inFlight', label: t('services.instances.inFlight'), isNumeric: true, cell: (row) => row.instance.live?.inFlight ?? NO_VALUE },
		{
			key: 'weight',
			label: t('services.instances.weight'),
			isNumeric: true,
			cell: (row) => <WeightInput service={service} instance={row.instance} actions={actions} />,
		},
		{
			key: 'share',
			label: t('services.instances.share'),
			isNumeric: true,
			cell: (row) => (row.sharePercent === null ? NO_VALUE : `${row.sharePercent}%`),
		},
		{ key: 'p95', label: t('services.instances.p95'), isNumeric: true, cell: (row) => formatLatency(row.traffic?.totals.p95Ms ?? null) },
		{
			key: 'errors',
			label: t('services.instances.errors'),
			isNumeric: true,
			cell: (row) => (row.traffic ? formatRate(row.traffic.totals.errorRate) : NO_VALUE),
		},
		{ key: 'chaos', label: t('services.instances.chaos'), cell: (row) => <ChaosBadge instance={row.instance} /> },
		{ key: 'actions', label: '', cell: (row) => <RowActions service={service} instance={row.instance} actions={actions} /> },
	];

	function handleRowClick(row: TableRow): void {
		if (row.kind === 'group') {
			return;
		}

		onToggle(row.instance.id);
	}

	const groupedColumns = columns.map(withGroupRow);
	const rows = toRows(service, traffic, t('services.instances.managedGroup'));

	return (
		<DataTable
			columns={groupedColumns}
			rows={rows}
			rowKey={rowKeyOf}
			empty={t('services.instances.empty')}
			onRowClick={handleRowClick}
			selectedRowKey={expandedInstanceId ?? undefined}
		/>
	);
}

// The group row writes its label in the first column and leaves the others empty.
function withGroupRow(column: DataTableColumn<InstanceRow>, index: number): DataTableColumn<TableRow> {
	function cell(row: TableRow): ReactNode {
		if (row.kind === 'instance') {
			return column.cell(row);
		}

		return index === 0 ? <span className="instance-group-label">{row.label}</span> : null;
	}

	// No column here sorts, so no sortValue to carry over.
	return { key: column.key, label: column.label, isNumeric: column.isNumeric, cell };
}

function rowKeyOf(row: TableRow): string {
	return row.kind === 'group' ? 'group-managed' : row.instance.id;
}

function stopClick(event: MouseEvent): void {
	event.stopPropagation();
}

function weightHintKey(instance: ServiceInstance): string {
	if (instance.source === 'managed') {
		return 'services.instances.managedTooltip';
	}

	return 'services.instances.weightOnlyWeighted';
}

function WeightInput({ service, instance, actions }: RowProps): ReactElement {
	const { t } = useTranslation();
	const [draft, setDraft] = useState(String(instance.weight));
	const [syncedWeight, setSyncedWeight] = useState(instance.weight);

	// The weight changed under the input (a rolled-back edit, another operator): the draft
	// follows it, adjusting state while rendering as React documents.
	if (instance.weight !== syncedWeight) {
		setSyncedWeight(instance.weight);
		setDraft(String(instance.weight));
	}

	const isEditable = service.lbStrategy === 'weighted_random' && instance.source === 'static';

	if (!isEditable) {
		return (
			<span className="instance-weight-off" data-tooltip={t(weightHintKey(instance))}>
				{instance.weight}
			</span>
		);
	}

	function handleChange(event: ChangeEvent<HTMLInputElement>): void {
		setDraft(event.target.value);
	}

	function handleBlur(): void {
		const weight = Number(draft);
		const isValid = Number.isInteger(weight) && weight >= MIN_WEIGHT && weight <= MAX_WEIGHT;

		if (!isValid) {
			return setDraft(String(instance.weight));
		}

		if (weight !== instance.weight) {
			void actions.setWeight(service, instance, weight);
		}
	}

	return (
		<input
			className="instance-weight-input mono"
			aria-label={t('services.instances.weightLabel', { instance: instance.name })}
			data-tooltip={t('services.instances.weightTooltip')}
			inputMode="numeric"
			value={draft}
			onChange={handleChange}
			onBlur={handleBlur}
			onClick={stopClick}
		/>
	);
}

function RowActions({ service, instance, actions }: RowProps): ReactElement {
	const { t } = useTranslation();
	const isManaged = instance.source === 'managed';

	function handleToggle(event: MouseEvent): void {
		event.stopPropagation();
		void (instance.isEnabled ? actions.drain(service, instance) : actions.enable(service, instance));
	}

	function handleRemove(event: MouseEvent): void {
		event.stopPropagation();
		actions.requestRemoveInstance(service, instance);
	}

	const toggleLabel = instance.isEnabled ? t('services.instances.drainTooltip') : t('services.instances.enableTooltip');
	const removeLabel = isManaged ? t('services.instances.managedTooltip') : t('services.instances.removeTooltip');

	return (
		<span className="instance-actions">
			<IconButton
				className="is-quiet"
				label={isManaged ? t('services.instances.managedTooltip') : toggleLabel}
				onClick={handleToggle}
				disabled={isManaged}
			>
				{instance.isEnabled ? <CirclePause size={15} /> : <CirclePlay size={15} />}
			</IconButton>
			<IconButton className="is-quiet is-destructive" label={removeLabel} onClick={handleRemove} disabled={isManaged}>
				<Trash2 size={15} />
			</IconButton>
		</span>
	);
}

function InstanceName({ instance }: { readonly instance: ServiceInstance }): ReactElement {
	const { t } = useTranslation();

	if (instance.source === 'static') {
		return <span className="mono">{instance.name}</span>;
	}

	return (
		<span className="instance-name">
			<span className="mono">{instance.name}</span>
			<span className="badge badge-info" data-tooltip={t('services.instances.managedTooltip')}>
				{t('services.instances.managed')}
			</span>
		</span>
	);
}

function ChaosBadge({ instance }: { readonly instance: ServiceInstance }): ReactElement {
	const { t } = useTranslation();

	if (!isChaosActive(instance.chaos) || instance.chaos === null) {
		return <span className="faint">{NO_VALUE}</span>;
	}

	const chaos = instance.chaos;
	const tooltip = t('chaos.activeTooltip', {
		latency: chaos.latencyMs,
		jitter: chaos.jitterMs,
		errors: Math.round(chaos.errorRate * 100),
		down: chaos.isDown ? t('chaos.yes') : t('chaos.no'),
	});

	return (
		<span className="badge badge-warning" data-tooltip={tooltip}>
			<FlaskConical size={11} aria-hidden="true" />
			{t('chaos.active')}
		</span>
	);
}

function toRows(service: Service, traffic: readonly InstanceTraffic[] | null, managedGroupLabel: string): readonly TableRow[] {
	const staticInstances = service.instances.filter((instance) => instance.source === 'static');
	const managedInstances = service.instances.filter((instance) => instance.source === 'managed');
	const ordered = [...staticInstances, ...managedInstances];
	const trafficById = new Map((traffic ?? []).map((entry) => [entry.instanceId, entry]));
	const shares = toSharePercents(ordered.map((instance) => trafficById.get(instance.id)?.share ?? 0));
	const instanceRows: readonly TableRow[] = ordered.map((instance, index) => {
		const entry = trafficById.get(instance.id) ?? null;

		return { kind: 'instance', instance, traffic: entry, sharePercent: traffic === null ? null : shares[index] };
	});

	if (managedInstances.length === 0) {
		return instanceRows;
	}

	const groupRow: TableRow = { kind: 'group', label: managedGroupLabel };
	const staticCount = staticInstances.length;

	return [...instanceRows.slice(0, staticCount), groupRow, ...instanceRows.slice(staticCount)];
}
