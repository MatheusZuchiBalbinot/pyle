import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { listRequestLog } from '@/app/api/adminApiClient';
import type { Page, PageQuery, RequestLogEntry, RequestLogFilter } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';
import { usePaginatedResource, type UsePaginatedResourceResult } from '@/app/hooks/usePaginatedResource';

export type RequestLogState = UsePaginatedResourceResult<RequestLogEntry> & {
	// When the list was read: it does not update by itself (it would jump
	// under the operator's eyes), only on "Atualizar" or a new filter.
	readonly snapshotAt: number | null;
};

export function useRequestLog(filter: RequestLogFilter): RequestLogState {
	const { t } = useTranslation();
	const [snapshotAt, setSnapshotAt] = useState<number | null>(null);
	const { routeId, consumerId, instanceId, statusClass } = filter;
	const load = useCallback(
		async (page: PageQuery): Promise<Page<RequestLogEntry>> => {
			const isFirstPage = page.cursor === undefined;
			const result = await listRequestLog({ routeId, consumerId, instanceId, statusClass }, page);

			if (isFirstPage) {
				setSnapshotAt(Date.now());
			}

			return result;
		},
		[routeId, consumerId, instanceId, statusClass],
	);
	const queryKey = queryKeys.requestLog({ routeId, consumerId, instanceId, statusClass });
	const resource = usePaginatedResource(load, { queryKey, fallbackErrorMessage: t('traffic.log.loadError') });

	return { ...resource, snapshotAt };
}
