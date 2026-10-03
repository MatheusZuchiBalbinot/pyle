import { RefreshCw } from 'lucide-react';
import { useMemo, useState, type ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { RequestLogEntry, RequestLogFilter, StatusClass } from '@/app/api/adminApiTypes';
import { useRequestLog } from '@/app/features/traffic/hooks/useRequestLog';
import { formatLatency } from '@/app/lib/formatTraffic';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { Button } from '@/app/ui/Button/Button';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';
import { LoadMoreFooter } from '@/app/ui/LoadMoreFooter/LoadMoreFooter';
import { PillGroup, type PillOption } from '@/app/ui/PillGroup/PillGroup';
import { SelectInput, type SelectOption } from '@/app/ui/SelectInput/SelectInput';
import { Skeleton } from '@/app/ui/Skeleton/Skeleton';

import { HttpStatusBadge } from '../HttpStatusBadge/HttpStatusBadge';

import './RequestLogTable.css';

export type RequestLogChoice = { readonly id: string; readonly label: string };

export type RequestLogTableProps = {
	// The route in focus on the page, or undefined for every route.
	readonly routeId: string | undefined;
	readonly consumers: readonly RequestLogChoice[];
	readonly instances: readonly RequestLogChoice[];
};

type StatusFilter = StatusClass | 'all';

const STATUS_FILTERS: readonly StatusFilter[] = ['all', '2xx', '4xx', '5xx'];
const ALL = '';
const SKELETON_ROWS = ['a', 'b', 'c', 'd', 'e'];

// A snapshot that stays put while read; "Atualizar" takes a new one.
export function RequestLogTable({ routeId, consumers, instances }: RequestLogTableProps): ReactElement {
	const { t, i18n } = useTranslation();
	const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
	const [consumerId, setConsumerId] = useState(ALL);
	const [instanceId, setInstanceId] = useState(ALL);
	const filter = useMemo<RequestLogFilter>(
		() => ({
			routeId,
			consumerId: optionalId(consumerId),
			instanceId: optionalId(instanceId),
			statusClass: statusFilter === 'all' ? undefined : statusFilter,
		}),
		[routeId, consumerId, instanceId, statusFilter],
	);
	const { loadState, isLoadingMore, loadMore, reload, snapshotAt } = useRequestLog(filter);

	const statusOptions: readonly PillOption<StatusFilter>[] = STATUS_FILTERS.map((value) => ({
		value,
		label: value === 'all' ? t('traffic.log.allStatuses') : t(`gateway.statusClass.${value}`),
		tooltip: t('traffic.log.statusTooltip'),
	}));
	const columns: readonly DataTableColumn<RequestLogEntry>[] = [
		{ key: 'at', label: t('traffic.log.time'), cell: (row) => <span className="mono">{formatSecondsTime(row.at, i18n.language)}</span> },
		{ key: 'method', label: t('traffic.log.method'), cell: (row) => <span className="mono">{row.method}</span> },
		{ key: 'path', label: t('traffic.log.path'), cell: (row) => <span className="mono request-log-path">{row.path}</span> },
		{ key: 'consumer', label: t('traffic.log.consumer'), cell: (row) => row.consumerSlug ?? t('traffic.log.anonymous') },
		{ key: 'instance', label: t('traffic.log.instance'), cell: (row) => row.instanceName ?? t('traffic.log.noInstance') },
		{ key: 'status', label: t('traffic.log.status'), cell: (row) => <HttpStatusBadge status={row.status} gatewayError={row.gatewayError} /> },
		{ key: 'duration', label: t('traffic.log.duration'), isNumeric: true, cell: (row) => formatLatency(row.durationMs) },
		{ key: 'attempts', label: t('traffic.log.attempts'), isNumeric: true, cell: (row) => row.attempts },
	];

	function handleRefresh(): void {
		void reload();
	}

	function renderBody(): ReactElement {
		if (loadState.status === LOAD_STATUS.loading) {
			return (
				<div className="request-log-skeleton">
					{SKELETON_ROWS.map((row) => (
						<Skeleton key={row} height="18px" />
					))}
				</div>
			);
		}

		if (loadState.status === LOAD_STATUS.error) {
			return <div className="error-state request-log-error">{loadState.message}</div>;
		}

		return (
			<>
				<DataTable columns={columns} rows={loadState.items} rowKey={(row) => row.requestId} empty={t('traffic.log.empty')} />
				<LoadMoreFooter loadedCount={loadState.items.length} hasMore={loadState.hasMore} isLoadingMore={isLoadingMore} onLoadMore={loadMore} />
			</>
		);
	}

	const snapshotLabel = snapshotAt === null ? '' : t('traffic.log.snapshot', { time: formatSecondsTime(snapshotAt, i18n.language) });

	return (
		<div className="request-log">
			<div className="request-log-toolbar">
				<PillGroup options={statusOptions} value={statusFilter} onChange={setStatusFilter} ariaLabel={t('traffic.log.statusFilter')} />
				<SelectInput
					label={t('traffic.log.consumerFilter')}
					options={toOptions(t('traffic.log.allConsumers'), consumers)}
					value={consumerId}
					onChange={setConsumerId}
				/>
				{instances.length > 0 && (
					<SelectInput
						label={t('traffic.log.instanceFilter')}
						options={toOptions(t('traffic.log.allInstances'), instances)}
						value={instanceId}
						onChange={setInstanceId}
					/>
				)}
				<span className="request-log-snapshot">{snapshotLabel}</span>
				<Button variant="pill" isSmall onClick={handleRefresh} data-tooltip={t('traffic.log.refreshTooltip')}>
					<RefreshCw size={12} aria-hidden="true" />
					{t('traffic.log.refresh')}
				</Button>
			</div>
			{renderBody()}
		</div>
	);
}

function toOptions(allLabel: string, choices: readonly RequestLogChoice[]): readonly SelectOption[] {
	return [{ value: ALL, label: allLabel }, ...choices.map((choice) => ({ value: choice.id, label: choice.label }))];
}

// A log reads to the second.
function formatSecondsTime(at: string | number, locale: string): string {
	return new Date(at).toLocaleTimeString(locale);
}

function optionalId(value: string): string | undefined {
	return value === ALL ? undefined : value;
}
