import type { PageId } from '@/app/shell/Sidebar/navItems';

import type { ConsoleSelection } from './gatewayContext';

const PAGE_BY_SELECTION_TYPE: Readonly<Record<ConsoleSelection['type'], PageId>> = {
	route: 'routes',
	'route-traffic': 'traffic',
	service: 'services',
	consumer: 'consumers',
	analysis: 'ai',
};

export function pageForSelection(selection: ConsoleSelection): PageId {
	return PAGE_BY_SELECTION_TYPE[selection.type];
}
