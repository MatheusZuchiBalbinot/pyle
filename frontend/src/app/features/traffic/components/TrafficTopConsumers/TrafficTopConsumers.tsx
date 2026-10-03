import type { ReactElement } from 'react';
import { useTranslation } from 'react-i18next';

import type { TopConsumer } from '@/app/api/adminApiTypes';
import { useGateway } from '@/app/core/gateway/useGateway';
import { formatCompactCount } from '@/app/lib/formatTraffic';
import { DataTable, type DataTableColumn } from '@/app/ui/DataTable/DataTable';

export type TrafficTopConsumersProps = { readonly consumers: readonly TopConsumer[] };

export function TrafficTopConsumers({ consumers }: TrafficTopConsumersProps): ReactElement {
	const { t } = useTranslation();
	const { openSelection } = useGateway();

	const nameOf = (row: TopConsumer): string => {
		if (row.consumerId === null) {
			return t('traffic.consumers.anonymous');
		}

		return row.name ?? t('traffic.consumers.removed');
	};

	const columns: readonly DataTableColumn<TopConsumer>[] = [
		{ key: 'name', label: t('traffic.consumers.name'), cell: nameOf },
		{ key: 'requests', label: t('traffic.consumers.requests'), isNumeric: true, cell: (row) => formatCompactCount(row.requestCount) },
		{ key: 'limited', label: t('traffic.consumers.rateLimited'), isNumeric: true, cell: (row) => formatCompactCount(row.rateLimitedCount) },
	];

	function handleRowClick(row: TopConsumer): void {
		if (!row.slug) {
			return;
		}

		openSelection({ type: 'consumer', consumerSlug: row.slug });
	}

	return <DataTable columns={columns} rows={consumers} rowKey={rowKey} empty={t('traffic.consumers.empty')} onRowClick={handleRowClick} />;
}

function rowKey(row: TopConsumer): string {
	return row.consumerId ?? 'anonymous';
}
