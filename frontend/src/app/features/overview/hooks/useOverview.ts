import { useTranslation } from 'react-i18next';

import { getAdminOverview } from '@/app/api/adminApiClient';
import type { AdminOverview } from '@/app/api/adminApiTypes';
import { isAlertEvent, isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useLiveTraffic, type UseLiveTrafficOptions } from '@/app/features/traffic/hooks/useLiveTraffic';
import type { UseAsyncResourceResult } from '@/app/hooks/useAsyncResource';

// Besides new traffic (throttled), what changes the Overview right away.
export function isOverviewChange(event: RealtimeEvent): boolean {
	const isStateChange =
		event.type === 'instance.state.changed' || event.type === 'gateway.status.changed' || event.type === 'system.component.changed';
	const isConfigChange = event.type === 'config.changed' || isEntityChange(event, ['Service', 'ServiceInstance', 'Route']);

	return isStateChange || isConfigChange || isAlertEvent(event);
}

export function overviewQuery(): PrefetchableQuery {
	return { queryKey: queryKeys.overview(), queryFn: getAdminOverview };
}

export function useOverview(): UseAsyncResourceResult<AdminOverview> {
	const { t } = useTranslation();

	const options: UseLiveTrafficOptions = {
		queryKey: queryKeys.overview(),
		fallbackErrorMessage: t('overviewPage.loadError'),
		refetchOn: isOverviewChange,
	};

	return useLiveTraffic(getAdminOverview, options);
}
