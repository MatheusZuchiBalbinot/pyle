export type PageId = 'overview' | 'traffic' | 'routes' | 'services' | 'consumers' | 'assistant' | 'ai' | 'settings';

export type NavIconName = 'gauge' | 'activity' | 'route' | 'server' | 'key-round' | 'bot' | 'sparkles' | 'settings';

export type NavItemDef = {
	readonly id: PageId;
	readonly labelKey: string;
	readonly icon: NavIconName;
};

export type NavGroup = {
	readonly labelKey: string;
	readonly items: readonly NavItemDef[];
};

export const NAV_GROUPS: readonly NavGroup[] = [
	{
		labelKey: 'sidebar.groups.operation',
		items: [
			{ id: 'overview', labelKey: 'sidebar.nav.overview', icon: 'gauge' },
			{ id: 'traffic', labelKey: 'sidebar.nav.traffic', icon: 'activity' },
		],
	},
	{
		labelKey: 'sidebar.groups.configuration',
		items: [
			{ id: 'routes', labelKey: 'sidebar.nav.routes', icon: 'route' },
			{ id: 'services', labelKey: 'sidebar.nav.services', icon: 'server' },
			{ id: 'consumers', labelKey: 'sidebar.nav.consumers', icon: 'key-round' },
		],
	},
	{
		labelKey: 'sidebar.groups.platform',
		items: [
			{ id: 'assistant', labelKey: 'sidebar.nav.assistant', icon: 'bot' },
			{ id: 'ai', labelKey: 'sidebar.nav.ai', icon: 'sparkles' },
			{ id: 'settings', labelKey: 'sidebar.nav.settings', icon: 'settings' },
		],
	},
];

export const DEFAULT_PAGE_ID: PageId = 'overview';

// Every page, in sidebar order.
export const PAGE_IDS: readonly PageId[] = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.id));
