const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JUST_NOW_MS = 10 * SECOND_MS;

type Unit = { readonly limitMs: number; readonly unit: Intl.RelativeTimeFormatUnit; readonly sizeMs: number };

const UNITS: readonly Unit[] = [
	{ limitMs: MINUTE_MS, unit: 'second', sizeMs: SECOND_MS },
	{ limitMs: HOUR_MS, unit: 'minute', sizeMs: MINUTE_MS },
	{ limitMs: DAY_MS, unit: 'hour', sizeMs: HOUR_MS },
	{ limitMs: Number.POSITIVE_INFINITY, unit: 'day', sizeMs: DAY_MS },
];

const formatters = new Map<string, Intl.RelativeTimeFormat>();

export function formatRelativeTime(iso: string, nowMs: number, locale: string): string {
	const elapsedMs = Math.max(0, nowMs - Date.parse(iso));

	if (elapsedMs < JUST_NOW_MS) {
		return formatterFor(locale).format(0, 'second');
	}

	const unit = UNITS.find((candidate) => elapsedMs < candidate.limitMs) ?? UNITS[UNITS.length - 1];

	return formatterFor(locale).format(-Math.floor(elapsedMs / unit.sizeMs), unit.unit);
}

function formatterFor(locale: string): Intl.RelativeTimeFormat {
	const cached = formatters.get(locale);

	if (cached) {
		return cached;
	}

	const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });

	formatters.set(locale, formatter);

	return formatter;
}
