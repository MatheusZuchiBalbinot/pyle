import { useEffect, useState } from 'react';

// Only the calling component re-renders on each tick.
export function useNow(intervalMs: number): number {
	const [now, setNow] = useState(() => Date.now());

	useEffect(() => {
		const intervalId = setInterval(() => setNow(Date.now()), intervalMs);

		return () => clearInterval(intervalId);
	}, [intervalMs]);

	return now;
}
