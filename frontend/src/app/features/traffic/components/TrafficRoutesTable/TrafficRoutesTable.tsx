import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteTrafficSummary } from '@/app/api/adminApiTypes';
import { formatCompactCount, formatLatency, formatRate, formatRps } from '@/app/lib/formatTraffic';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';

export type TrafficRoutesTableProps = {
	readonly routes: readonly RouteTrafficSummary[];
	readonly onSelect: (routeId: string) => void;
};

export function TrafficRoutesTable({ routes, onSelect }: TrafficRoutesTableProps): ReactElement {
	const { t } = useTranslation();
	const columns: readonly DataTableColumn<RouteTrafficSummary>[] = [
		{ key: 'name', label: t('traffic.routes.name'), isSortable: true, sortValue: (row) => row.name, cell: (row) => row.name },
		{ key: 'prefix', label: t('traffic.routes.prefix'), cell: (row) => <span className="mono">{row.pathPrefix}</span> },
		{
			key: 'requests',
			label: t('traffic.routes.requests'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals.requestCount,
			cell: (row) => formatCompactCount(row.totals.requestCount),
		},
		{
			key: 'rps',
			label: t('traffic.routes.rps'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals.requestsPerSecond,
			cell: (row) => formatRps(row.totals.requestsPerSecond),
		},
		{
			key: 'p95',
			label: t('traffic.routes.p95'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals.p95Ms ?? -1,
			cell: (row) => formatLatency(row.totals.p95Ms),
		},
		{
			key: 'errors',
			label: t('traffic.routes.errors'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals.errorRate,
			cell: (row) => formatRate(row.totals.errorRate),
		},
		{
			key: 'limited',
			label: t('traffic.routes.rateLimited'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals.rateLimitedCount,
			cell: (row) => formatCompactCount(row.totals.rateLimitedCount),
		},
	];

	function handleRowClick(row: RouteTrafficSummary): void {
		onSelect(row.routeId);
	}

	return <DataTable columns={columns} rows={routes} rowKey={(row) => row.routeId} empty={t('traffic.routes.empty')} onRowClick={handleRowClick} />;
}
