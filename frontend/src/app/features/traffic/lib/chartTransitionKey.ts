import type { TrafficWindow } from '@/app/api/adminApiTypes';

const MS_PER_MINUTE = 60_000;

// Changes when the operator picks another metric or window length, and only
// then: a live refresh must ease the lines, not redraw the chart. The server
// aligns `from` down to the minute and ends at now, so a 1 h window measures
// anything from 60:00 to 60:59: whole minutes, rounded down.
export function chartTransitionKey(metric: string, window: Pick<TrafficWindow, 'from' | 'to'>): string {
	const lengthMinutes = Math.floor((Date.parse(window.to) - Date.parse(window.from)) / MS_PER_MINUTE);

	return `${metric}:${lengthMinutes}`;
}
