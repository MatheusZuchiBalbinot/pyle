const DEFAULT_LOCALE = 'pt-BR';
const MS_PER_SECOND = 1000;
const PERCENT_FACTOR = 100;
// Below this a rate reads as "<0,1%" rather than a misleading "0%".
const SMALLEST_SHOWN_PERCENT = 0.1;
const HIGH_RPS = 100;
const MISSING_VALUE = '-';

const formatters = new Map<string, Intl.NumberFormat>();

function formatterFor(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
	const key = `${locale}|${JSON.stringify(options)}`;
	const cached = formatters.get(key);

	if (cached) {
		return cached;
	}

	const formatter = new Intl.NumberFormat(locale, options);

	formatters.set(key, formatter);

	return formatter;
}

const ONE_DECIMAL: Intl.NumberFormatOptions = { maximumFractionDigits: 1 };
const NO_DECIMALS: Intl.NumberFormatOptions = { maximumFractionDigits: 0 };

// "12,3/s"; whole numbers from 100 up.
export function formatRps(value: number, locale: string = DEFAULT_LOCALE): string {
	const options = value >= HIGH_RPS ? NO_DECIMALS : ONE_DECIMAL;

	return `${formatterFor(locale, options).format(value)}/s`;
}

// "85 ms", "1,2 s", or "-" when there is no figure (no traffic).
export function formatLatency(ms: number | null, locale: string = DEFAULT_LOCALE): string {
	if (ms === null) {
		return MISSING_VALUE;
	}

	if (ms < MS_PER_SECOND) {
		return `${formatterFor(locale, NO_DECIMALS).format(ms)} ms`;
	}

	return `${formatterFor(locale, ONE_DECIMAL).format(ms / MS_PER_SECOND)} s`;
}

// A 0..1 fraction as "1,2%".
export function formatRate(fraction: number, locale: string = DEFAULT_LOCALE): string {
	const percent = fraction * PERCENT_FACTOR;

	if (percent === 0) {
		return '0%';
	}

	if (percent < SMALLEST_SHOWN_PERCENT) {
		return `<${formatterFor(locale, ONE_DECIMAL).format(SMALLEST_SHOWN_PERCENT)}%`;
	}

	return `${formatterFor(locale, ONE_DECIMAL).format(percent)}%`;
}

// "950", "12,3 mil", "1,9 mi".
export function formatCompactCount(value: number, locale: string = DEFAULT_LOCALE): string {
	return formatterFor(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
