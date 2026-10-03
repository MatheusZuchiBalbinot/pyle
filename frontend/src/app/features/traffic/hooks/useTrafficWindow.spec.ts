import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTrafficWindow } from './useTrafficWindow';

describe('useTrafficWindow', () => {
	afterEach(() => {
		window.localStorage.clear();
		vi.restoreAllMocks();
	});

	it('starts from the fallback, then remembers the choice per page', () => {
		const { result } = renderHook(() => useTrafficWindow('traffic', '1h'));

		expect(result.current.window).toBe('1h');

		act(() => result.current.setWindow('6h'));

		expect(result.current.window).toBe('6h');
		expect(renderHook(() => useTrafficWindow('traffic', '1h')).result.current.window).toBe('6h');
		expect(renderHook(() => useTrafficWindow('overview', '15m')).result.current.window).toBe('15m');
	});

	it('ignores a stored value it does not know', () => {
		window.localStorage.setItem('pyle:traffic-window:traffic', '2d');

		expect(renderHook(() => useTrafficWindow('traffic', '1h')).result.current.window).toBe('1h');
	});

	it('keeps working when storage throws', () => {
		vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
			throw new Error('blocked');
		});
		const { result } = renderHook(() => useTrafficWindow('traffic', '1h'));

		act(() => result.current.setWindow('24h'));

		expect(result.current.window).toBe('24h');
	});
});
