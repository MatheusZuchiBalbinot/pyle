import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { ConsumerRow } from '@/app/features/consumers/hooks/useConsumersPage';
import { useNow } from '@/app/hooks/useNow';
import { formatCompactCount } from '@/app/lib/formatTraffic';
import { formatRelativeTime } from '@/app/lib/relativeTime';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';

const NO_VALUE = '-';
const CLOCK_MS = 30_000;

export type ConsumerListProps = {
	readonly rows: readonly ConsumerRow[];
	readonly expandedSlug: string | null;
	readonly onToggle: (slug: string) => void;
};

export function ConsumerList({ rows, expandedSlug, onToggle }: ConsumerListProps): ReactElement {
	const { t } = useTranslation();
	const nowMs = useNow(CLOCK_MS);
	const usageHint = t('consumers.list.usageHint');
	const columns: readonly DataTableColumn<ConsumerRow>[] = [
		{ key: 'name', label: t('consumers.list.name'), isSortable: true, sortValue: (row) => row.consumer.name, cell: (row) => row.consumer.name },
		{ key: 'slug', label: t('consumers.list.slug'), cell: (row) => <span className="mono">{row.consumer.slug}</span> },
		{ key: 'limit', label: t('consumers.list.rateLimit'), isNumeric: true, cell: (row) => formatCompactCount(row.consumer.rateLimitPerMinute) },
		{
			key: 'routes',
			label: t('consumers.list.routes'),
			cell: (row) => (row.consumer.allowedRoutes.length === 0 ? t('consumers.list.allRoutes') : String(row.consumer.allowedRoutes.length)),
		},
		{
			key: 'keys',
			label: t('consumers.list.activeKeys'),
			isNumeric: true,
			cell: (row) => row.consumer.apiKeys.filter((key) => key.revokedAt === null).length,
		},
		{
			key: 'lastUsed',
			label: t('consumers.list.lastUsed'),
			cell: (row) => <LastUsedCell row={row} nowMs={nowMs} />,
		},
		{
			key: 'requests',
			label: t('consumers.list.requests'),
			isNumeric: true,
			cell: (row) => <span data-tooltip={usageHint}>{row.usage ? formatCompactCount(row.usage.requestCount) : NO_VALUE}</span>,
		},
		{
			key: 'limited',
			label: t('consumers.list.rateLimited'),
			isNumeric: true,
			cell: (row) => <span data-tooltip={usageHint}>{row.usage ? formatCompactCount(row.usage.rateLimitedCount) : NO_VALUE}</span>,
		},
	];

	function handleRowClick(row: ConsumerRow): void {
		onToggle(row.consumer.slug);
	}

	return (
		<DataTable
			columns={columns}
			rows={rows}
			rowKey={(row) => row.consumer.id}
			empty={t('consumers.list.empty')}
			onRowClick={handleRowClick}
			selectedRowKey={rows.find((row) => row.consumer.slug === expandedSlug)?.consumer.id}
		/>
	);
}

function lastUsedAt(row: ConsumerRow): string | null {
	const used = row.consumer.apiKeys.map((key) => key.lastUsedAt).filter((value): value is string => value !== null);

	if (used.length === 0) {
		return null;
	}

	return used.reduce((latest, value) => (value > latest ? value : latest));
}

function LastUsedCell({ row, nowMs }: { readonly row: ConsumerRow; readonly nowMs: number }): ReactElement {
	const { t, i18n } = useTranslation();
	const at = lastUsedAt(row);

	return <>{at === null ? t('consumers.keys.neverUsed') : formatRelativeTime(at, nowMs, i18n.language)}</>;
}
