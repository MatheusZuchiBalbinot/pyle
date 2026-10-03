import { Lock, LockOpen } from 'lucide-react';
import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { RouteRow } from '@/app/features/routes/hooks/useRoutesPage';
import { formatCompactCount, formatLatency, formatRate, formatRps } from '@/app/lib/formatTraffic';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';

const NO_VALUE = '-';

export type RouteListProps = {
	readonly rows: readonly RouteRow[];
	readonly expandedRouteId: string | null;
	readonly onToggle: (routeId: string) => void;
};

export function RouteList({ rows, expandedRouteId, onToggle }: RouteListProps): ReactElement {
	const { t } = useTranslation();
	const columns: readonly DataTableColumn<RouteRow>[] = [
		{ key: 'name', label: t('routes.list.name'), isSortable: true, sortValue: (row) => row.route.name, cell: (row) => row.route.name },
		{
			key: 'prefix',
			label: t('routes.list.prefix'),
			isSortable: true,
			sortValue: (row) => row.route.pathPrefix,
			cell: (row) => <span className="mono">{row.route.pathPrefix}</span>,
		},
		{ key: 'service', label: t('routes.list.service'), cell: (row) => row.route.service.name },
		{
			key: 'methods',
			label: t('routes.list.methods'),
			cell: (row) => <span className="mono">{row.route.methods.length === 0 ? t('routes.list.allMethods') : row.route.methods.join(' ')}</span>,
		},
		{ key: 'auth', label: t('routes.list.auth'), cell: (row) => <AuthCell row={row} /> },
		{ key: 'limit', label: t('routes.list.rateLimit'), isNumeric: true, cell: (row) => formatLimit(row.route.rateLimitPerMinute) },
		{
			key: 'rps',
			label: t('routes.list.rps'),
			isNumeric: true,
			isSortable: true,
			sortValue: (row) => row.totals?.requestsPerSecond ?? -1,
			cell: (row) => (row.totals ? formatRps(row.totals.requestsPerSecond) : NO_VALUE),
		},
		{ key: 'p95', label: t('routes.list.p95'), isNumeric: true, cell: (row) => formatLatency(row.totals?.p95Ms ?? null) },
		{ key: 'errors', label: t('routes.list.errors'), isNumeric: true, cell: (row) => (row.totals ? formatRate(row.totals.errorRate) : NO_VALUE) },
	];

	function handleRowClick(row: RouteRow): void {
		onToggle(row.route.id);
	}

	return (
		<DataTable
			columns={columns}
			rows={rows}
			rowKey={(row) => row.route.id}
			empty={t('routes.list.empty')}
			onRowClick={handleRowClick}
			selectedRowKey={expandedRouteId ?? undefined}
		/>
	);
}

function AuthCell({ row }: { readonly row: RouteRow }): ReactElement {
	const { t } = useTranslation();
	const isAuthRequired = row.route.isAuthRequired;
	const Icon = isAuthRequired ? Lock : LockOpen;
	const tooltip = isAuthRequired ? t('routes.list.authRequired') : t('routes.list.public');
	const label = isAuthRequired ? t('routes.list.authBadge') : t('routes.list.publicBadge');

	return (
		<span className={`badge ${isAuthRequired ? 'badge-muted' : 'badge-info'}`} data-tooltip={tooltip}>
			<Icon size={11} aria-hidden="true" />
			{label}
		</span>
	);
}

function formatLimit(limitPerMinute: number | null): string {
	if (limitPerMinute === null) {
		return NO_VALUE;
	}

	return formatCompactCount(limitPerMinute);
}
