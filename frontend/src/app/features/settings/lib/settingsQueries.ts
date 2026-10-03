import { getAlertRules, getPlatformSettings, getSystemHealth } from '@/app/api/adminApiClient';
import type { AlertRuleConfig, PlatformSettings, SystemHealthComponentStatus } from '@/app/api/adminApiTypes';
import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { queryKeys } from '@/app/core/query/queryKeys';

// The Settings page's three reads, shared by the components that show them and by the
// shell's prefetch on hover (shell/lib/pagePrefetch.ts).

export function platformSettingsQuery(): PrefetchableQuery<PlatformSettings> {
	return { queryKey: queryKeys.platformSettings(), queryFn: getPlatformSettings };
}

export function alertRulesQuery(): PrefetchableQuery<readonly AlertRuleConfig[]> {
	return { queryKey: queryKeys.alertRules(), queryFn: getAlertRules };
}

export function systemHealthQuery(): PrefetchableQuery<readonly SystemHealthComponentStatus[]> {
	return { queryKey: queryKeys.systemHealth(), queryFn: getSystemHealth };
}
