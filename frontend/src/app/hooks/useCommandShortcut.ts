import { useEffect } from 'react';

// Always preventDefault, or the browser's own binding (Chrome's Ctrl+K) fires too.
export function useCommandShortcut(key: string, onTrigger: () => void): void {
	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent): void {
			const hasCommandModifier = event.metaKey || event.ctrlKey;
			const isShortcut = hasCommandModifier && event.key.toLowerCase() === key;

			if (!isShortcut) {
				return;
			}

			event.preventDefault();
			onTrigger();
		}

		document.addEventListener('keydown', handleKeyDown);

		return () => document.removeEventListener('keydown', handleKeyDown);
	}, [key, onTrigger]);
}
