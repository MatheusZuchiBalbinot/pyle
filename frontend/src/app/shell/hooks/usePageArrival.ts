import { useEffect, useRef } from 'react';

import type { PageId } from '../Sidebar/navItems';

// What a page change does besides showing the page: the window goes back to where that page
// was left (top on a first visit), and the focus moves to the page's heading, so keyboard
// and screen reader users land on the new page instead of in the sidebar.
export function usePageArrival(activePage: PageId): void {
	const scrollByPageRef = useRef(new Map<PageId, number>());
	const previousPageRef = useRef(activePage);

	useEffect(() => {
		if (previousPageRef.current === activePage) {
			return;
		}

		previousPageRef.current = activePage;
		window.scrollTo(0, scrollByPageRef.current.get(activePage) ?? 0);
		focusHeading(activePage);
	}, [activePage]);

	// The scroll position of the page being left, read continuously: by the time the effect
	// above runs, the window already shows the next page.
	useEffect(() => {
		function handleScroll(): void {
			scrollByPageRef.current.set(previousPageRef.current, window.scrollY);
		}

		window.addEventListener('scroll', handleScroll, { passive: true });

		return () => window.removeEventListener('scroll', handleScroll);
	}, []);
}

function focusHeading(page: PageId): void {
	const heading = document.querySelector<HTMLElement>(`[data-page-frame="${page}"] h1`);

	if (heading === null) {
		return;
	}

	heading.tabIndex = -1;
	heading.focus({ preventScroll: true });
}
