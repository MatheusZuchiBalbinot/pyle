import type { AiTool } from '../../ai-analysis/application/ai-tool.js';

// The model repeats the timestamps it reads. Tools speak UTC, so an operator in São Paulo was
// told "before 18:06" about 15:06. Every timestamp a tool returns is rewritten in the
// operator's zone, with its offset, before the model sees it: the time it repeats is theirs.

// An ISO-8601 UTC instant as the tools write it (Date#toISOString, optional milliseconds).
const UTC_TIMESTAMP_PATTERN = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g;
const UTC_OFFSET = '+00:00';

// "2026-10-02T15:06:00-03:00": the same instant, as the operator's wall clock.
export function toOperatorTime(instant: Date, timeZone: string): string {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
		hourCycle: 'h23',
		timeZoneName: 'longOffset',
	}).formatToParts(instant);
	const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((item) => item.type === type)?.value ?? '';
	const offset = part('timeZoneName').replace('GMT', '') || UTC_OFFSET;

	return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}:${part('second')}${offset}`;
}

export function localizeTimestamps(text: string, timeZone: string): string {
	return text.replace(UTC_TIMESTAMP_PATTERN, (timestamp) => toOperatorTime(new Date(timestamp), timeZone));
}

export function withOperatorTimes(tools: readonly AiTool[], timeZone: string): readonly AiTool[] {
	return tools.map((tool) => ({ ...tool, run: async (input) => localizeTimestamps(await tool.run(input), timeZone) }));
}
