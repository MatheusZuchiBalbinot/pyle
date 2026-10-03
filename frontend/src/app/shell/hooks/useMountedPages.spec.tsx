import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PAGE_IDS, type PageId } from '../Sidebar/navItems';
import { useMountedPages } from './useMountedPages';

describe('useMountedPages', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('mounts the visited pages first, and every page once the browser is idle', () => {
		const { result, rerender } = renderHook(({ page }: { page: PageId }) => useMountedPages(page), { initialProps: { page: 'routes' } });

		expect(result.current).toEqual(['routes']);
		rerender({ page: 'services' });
		expect(result.current).toEqual(['routes', 'services']);

		act(() => vi.runAllTimers());

		expect(result.current).toEqual(PAGE_IDS);
	});
});
