import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useApiKeyReveal } from './useApiKeyReveal';

describe('useApiKeyReveal', () => {
	it('holds the key only until it is acknowledged', () => {
		const { result } = renderHook(() => useApiKeyReveal());

		act(() => result.current.reveal('Web app', 'pyle_live_secret'));
		expect(result.current.revealed).toEqual({ consumerName: 'Web app', apiKey: 'pyle_live_secret' });
		act(() => result.current.acknowledge());

		expect(result.current.revealed).toBeNull();
	});

	it('starts empty, as on every new mount', () => {
		const first = renderHook(() => useApiKeyReveal());

		act(() => first.result.current.reveal('Web app', 'pyle_live_secret'));
		first.unmount();

		expect(renderHook(() => useApiKeyReveal()).result.current.revealed).toBeNull();
	});
});
