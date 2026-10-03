import { useState } from 'react';

import type { PageId } from '../Sidebar/navItems';

// The shell keeps every visited page mounted, so going back keeps what was loaded.
export function useVisitedPages(activePage: PageId): readonly PageId[] {
	const [visitedPages, setVisitedPages] = useState<readonly PageId[]>([activePage]);

	if (visitedPages.includes(activePage)) {
		return visitedPages;
	}

	const nextPages = [...visitedPages, activePage];

	setVisitedPages(nextPages);

	return nextPages;
}
