import { useEffect, useState } from 'react';

// The longest the shell waits for the browser to go idle before doing background work anyway.
const IDLE_TIMEOUT_MS = 2000;

// False until the browser first has nothing better to do after mount.
export function useBrowserIdle(): boolean {
	const [isIdle, setIsIdle] = useState(false);

	useEffect(() => {
		function markIdle(): void {
			setIsIdle(true);
		}

		if (typeof window.requestIdleCallback !== 'function') {
			const timerId = window.setTimeout(markIdle, IDLE_TIMEOUT_MS);

			return () => window.clearTimeout(timerId);
		}

		const callbackId = window.requestIdleCallback(markIdle, { timeout: IDLE_TIMEOUT_MS });

		return () => window.cancelIdleCallback(callbackId);
	}, []);

	return isIdle;
}
