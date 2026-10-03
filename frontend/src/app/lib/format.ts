type DateTimeStyle = 'date-time' | 'clock';

const DATE_TIME_STYLE_OPTIONS: Readonly<Record<DateTimeStyle, Intl.DateTimeFormatOptions>> = {
	'date-time': { dateStyle: 'short', timeStyle: 'short' },
	clock: { timeStyle: 'short' },
};

// Intl formatters are costly to build and tables format every cell; bounded by the few
// locales shipped.
const dateTimeFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatDateTime(iso: string, locale: string): string {
	return dateTimeFormatterFor(locale, 'date-time').format(new Date(iso));
}

export function formatClockTime(at: number, locale: string): string {
	return dateTimeFormatterFor(locale, 'clock').format(new Date(at));
}

function dateTimeFormatterFor(locale: string, style: DateTimeStyle): Intl.DateTimeFormat {
	const cacheKey = `${locale}|${style}`;
	const cached = dateTimeFormatters.get(cacheKey);

	if (cached) {
		return cached;
	}

	const formatter = new Intl.DateTimeFormat(locale, DATE_TIME_STYLE_OPTIONS[style]);

	dateTimeFormatters.set(cacheKey, formatter);

	return formatter;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;

// "30s", "2 min", "1h 30 min" — for configured intervals/timeouts.
export function formatDurationMs(ms: number): string {
	const totalSeconds = Math.round(ms / MS_PER_SECOND);

	if (totalSeconds < SECONDS_PER_MINUTE) {
		return `${totalSeconds} s`;
	}

	const totalMinutes = Math.round(totalSeconds / SECONDS_PER_MINUTE);

	if (totalMinutes < MINUTES_PER_HOUR) {
		return `${totalMinutes} min`;
	}

	const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
	const minutes = totalMinutes % MINUTES_PER_HOUR;

	return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
