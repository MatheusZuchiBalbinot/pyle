import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useNow } from './useNow';

describe('useNow', () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it('ticks at its interval and stops on unmount', () => {
		vi.useFakeTimers();
		vi.setSystemTime(1000);
		const { result, unmount } = renderHook(() => useNow(5000));

		expect(result.current).toBe(1000);

		act(() => vi.advanceTimersByTime(5000));
		expect(result.current).toBe(6000);
		unmount();

		expect(vi.getTimerCount()).toBe(0);
	});
});
