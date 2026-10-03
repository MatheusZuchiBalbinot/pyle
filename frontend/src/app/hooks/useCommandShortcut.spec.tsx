import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { formatCommandShortcut, isApplePlatform } from '../lib/platform';
import { useCommandShortcut } from './useCommandShortcut';

function pressKey(key: string, modifiers: { metaKey?: boolean; ctrlKey?: boolean } = {}): KeyboardEvent {
	const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers });

	act(() => {
		document.dispatchEvent(event);
	});

	return event;
}

function setPlatform(platform: string): void {
	Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
}

describe('useCommandShortcut', () => {
	it('fires on the command modifier', () => {
		const onTrigger = vi.fn();

		renderHook(() => useCommandShortcut('k', onTrigger));

		pressKey('k', { metaKey: true });

		expect(onTrigger).toHaveBeenCalledOnce();
	});

	it('fires on the control modifier too', () => {
		const onTrigger = vi.fn();

		renderHook(() => useCommandShortcut('k', onTrigger));

		pressKey('k', { ctrlKey: true });

		expect(onTrigger).toHaveBeenCalledOnce();
	});

	it('ignores the key without a modifier, so typing never triggers it', () => {
		const onTrigger = vi.fn();

		renderHook(() => useCommandShortcut('k', onTrigger));

		pressKey('k');

		expect(onTrigger).not.toHaveBeenCalled();
	});

	it('ignores a different key', () => {
		const onTrigger = vi.fn();

		renderHook(() => useCommandShortcut('k', onTrigger));

		pressKey('j', { metaKey: true });

		expect(onTrigger).not.toHaveBeenCalled();
	});

	it('matches whatever case the key arrives in', () => {
		const onTrigger = vi.fn();

		renderHook(() => useCommandShortcut('k', onTrigger));

		pressKey('K', { metaKey: true });

		expect(onTrigger).toHaveBeenCalledOnce();
	});

	// Otherwise Chrome's own Ctrl+K (address-bar search) fires as well.
	it('stops the browser from also acting on the shortcut', () => {
		renderHook(() => useCommandShortcut('k', vi.fn()));

		const event = pressKey('k', { metaKey: true });

		expect(event.defaultPrevented).toBe(true);
	});

	it('stops listening on unmount', () => {
		const onTrigger = vi.fn();
		const { unmount } = renderHook(() => useCommandShortcut('k', onTrigger));

		unmount();
		pressKey('k', { metaKey: true });

		expect(onTrigger).not.toHaveBeenCalled();
	});
});

describe('the shortcut label', () => {
	const originalPlatform = navigator.platform;

	afterEach(() => {
		setPlatform(originalPlatform);
	});

	it('uses the command symbol on Apple keyboards', () => {
		setPlatform('MacIntel');

		expect(isApplePlatform()).toBe(true);
		expect(formatCommandShortcut('k')).toBe('⌘ K');
	});

	it('uses Ctrl everywhere else', () => {
		setPlatform('Win32');

		expect(isApplePlatform()).toBe(false);
		expect(formatCommandShortcut('k')).toBe('Ctrl K');
	});

	it('recognizes the mobile Apple platforms too', () => {
		setPlatform('iPhone');

		expect(isApplePlatform()).toBe(true);
	});
});
