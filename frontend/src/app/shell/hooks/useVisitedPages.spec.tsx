import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { PageId } from '../Sidebar/navItems';
import { useVisitedPages } from './useVisitedPages';

describe('useVisitedPages', () => {
	it('starts with the page the app opened on', () => {
		const { result } = renderHook(() => useVisitedPages('overview'));

		expect(result.current).toEqual(['overview']);
	});

	it('appends each newly visited page, in first-visit order', () => {
		const { result, rerender } = renderHook((page: PageId) => useVisitedPages(page), { initialProps: 'overview' as PageId });

		rerender('routes');
		rerender('services');

		expect(result.current).toEqual(['overview', 'routes', 'services']);
	});

	// The shell keeps every visited page mounted; listing one twice would
	// mount it twice.
	it('does not list a page again when the user goes back to it', () => {
		const { result, rerender } = renderHook((page: PageId) => useVisitedPages(page), { initialProps: 'overview' as PageId });

		rerender('routes');

		rerender('overview');

		expect(result.current).toEqual(['overview', 'routes']);
	});

	it('returns the new page in the same render it was first visited', () => {
		const { result, rerender } = renderHook((page: PageId) => useVisitedPages(page), { initialProps: 'overview' as PageId });

		rerender('services');

		expect(result.current).toContain('services');
	});
});
