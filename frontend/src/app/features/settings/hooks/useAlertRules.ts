import { useTranslation } from 'react-i18next';

import type { AlertRuleConfig } from '@/app/api/adminApiTypes';
import { isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { alertRulesQuery } from '@/app/features/settings/lib/settingsQueries';
import { useAsyncResource, type AsyncResourceState } from '@/app/hooks/useAsyncResource';

export type AlertRulesLoadState = AsyncResourceState<readonly AlertRuleConfig[]>;

export type UseAlertRulesResult = {
	readonly loadState: AlertRulesLoadState;
	readonly refetch: () => Promise<void>;
};

// One instance per page, so the hero and the editor never disagree.
export function useAlertRules(): UseAlertRulesResult {
	const { t } = useTranslation();

	const query = alertRulesQuery();

	return useAsyncResource(query.queryFn, {
		queryKey: query.queryKey,
		fallbackErrorMessage: t('alertRuleConfigPanel.loadError'),
		refetchOn: isAlertRuleEvent,
	});
}

function isAlertRuleEvent(event: RealtimeEvent): boolean {
	return isEntityChange(event, ['AlertRuleConfig']);
}
