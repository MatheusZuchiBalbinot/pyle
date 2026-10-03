import { PAGE_IDS, type PageId } from '../Sidebar/navItems';
import { useBrowserIdle } from './useBrowserIdle';
import { useVisitedPages } from './useVisitedPages';

// The pages the shell keeps mounted: the visited ones at first, then, once the browser is
// idle, all of them. A hidden <Activity> renders its page ahead of time (its chunk loaded,
// its frame laid out) without running its effects, so nothing is fetched until the page
// is shown, and the first visit no longer goes through a generic chunk skeleton.
export function useMountedPages(activePage: PageId): readonly PageId[] {
	const visitedPages = useVisitedPages(activePage);
	const isIdle = useBrowserIdle();

	if (isIdle) {
		return PAGE_IDS;
	}

	return visitedPages;
}
