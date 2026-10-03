import type { ListAiAnalysesFilter, RequestLogFilter, TrafficWindowName } from '@/app/api/adminApiTypes';
import type { ListAdminNotificationsFilter } from '@/app/api/notificationTypes';

// Every query key in one place: a key names the data shape and the inputs the
// loader uses, so two screens asking the same thing share one cache entry, and
// invalidating a prefix (e.g. ['traffic']) reaches every variant.
export const queryKeys = {
	configList: (kind: 'services' | 'routes' | 'consumers') => ['config-list', kind] as const,
	consumers: () => ['consumers', 'list'] as const,
	overview: () => ['overview'] as const,
	trafficOverview: (window: TrafficWindowName) => ['traffic', 'overview', window] as const,
	trafficPage: (window: TrafficWindowName, routeId: string | null) => ['traffic', 'page', window, routeId] as const,
	routeTraffic: (routeId: string, window: TrafficWindowName) => ['traffic', 'route', routeId, window] as const,
	consumerTraffic: (consumerSlug: string, window: TrafficWindowName) => ['traffic', 'consumer', consumerSlug, window] as const,
	servicesTraffic: (serviceSlugs: string) => ['traffic', 'services', serviceSlugs] as const,
	requestLog: (filter: RequestLogFilter) => ['traffic', 'request-log', filter] as const,
	instanceChanges: (instanceId: string) => ['activity', 'instance', instanceId] as const,
	servicesCapabilities: () => ['platform-settings', 'services-capabilities'] as const,
	platformSettings: () => ['platform-settings'] as const,
	alertRules: () => ['alert-rules'] as const,
	systemHealth: () => ['system-health'] as const,
	notificationsAttention: () => ['notifications', 'attention'] as const,
	notificationsInbox: (filter: ListAdminNotificationsFilter) => ['notifications', 'inbox', filter] as const,
	aiAnalyses: (filter: ListAiAnalysesFilter) => ['ai', 'analyses', filter] as const,
	aiAnalysisSummary: () => ['ai', 'summary'] as const,
	aiConversation: (analysisId: string) => ['ai', 'conversation', analysisId] as const,
};
