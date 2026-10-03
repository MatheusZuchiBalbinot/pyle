import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { NAV_GROUPS, type PageId } from '../Sidebar/navItems';

const APP_NAME = 'Pyle';
const TITLE_SEPARATOR = ' · ';

// The page's name in the tab, so the browser's history and bookmarks tell the pages apart.
export function useDocumentTitle(page: PageId): void {
	const { t } = useTranslation();
	const labelKey = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.id === page)?.labelKey;

	useEffect(() => {
		document.title = labelKey === undefined ? APP_NAME : `${t(labelKey)}${TITLE_SEPARATOR}${APP_NAME}`;
	}, [labelKey, t]);
}
