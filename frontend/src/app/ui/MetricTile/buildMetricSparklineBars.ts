import type { TFunction } from 'i18next';

export type MetricSparklineBar = {
	readonly heightPercent: number;
	readonly tooltip: string;
	readonly hasValue: boolean;
};

export type MetricSparklineInput = {
	readonly values: readonly (number | null)[];
	readonly timestamps: readonly string[];
	readonly formatValue: (value: number) => string;
	readonly locale: string;
	readonly t: TFunction;
};

type BarContext = {
	readonly min: number;
	readonly range: number;
	readonly max: number;
	readonly formatValue: (value: number) => string;
	readonly t: TFunction;
};

const MIN_BAR_HEIGHT_PERCENT = 6;

// A series that never moves has no scale of its own: all zeros sit on the
// floor (nothing happened), any other constant sits mid-height.
const FLAT_SERIES_HEIGHT_PERCENT = 50;

// Each tile is scaled to its own series (small multiples, never a shared axis).
export function buildMetricSparklineBars({ values, timestamps, formatValue, locale, t }: MetricSparklineInput): readonly MetricSparklineBar[] {
	const definedValues = values.filter((value): value is number => value !== null);
	const min = definedValues.length > 0 ? Math.min(...definedValues) : 0;
	const max = definedValues.length > 0 ? Math.max(...definedValues) : 0;
	const range = max - min;

	const context: BarContext = { min, range, max, formatValue, t };

	return values.map((value, index) => {
		const timestampLabel = new Date(timestamps[index]).toLocaleTimeString(locale);

		return buildBar(value, timestampLabel, context);
	});
}

function buildBar(value: number | null, timestampLabel: string, context: BarContext): MetricSparklineBar {
	if (value === null) {
		return {
			heightPercent: MIN_BAR_HEIGHT_PERCENT,
			tooltip: context.t('metricTile.noDataTooltip', { timestamp: timestampLabel }),
			hasValue: false,
		};
	}

	const normalized = context.range > 0 ? ((value - context.min) / context.range) * 100 : flatSeriesHeight(context.max);

	return {
		heightPercent: Math.max(MIN_BAR_HEIGHT_PERCENT, normalized),
		tooltip: context.t('metricTile.valueTooltip', { timestamp: timestampLabel, value: context.formatValue(value) }),
		hasValue: true,
	};
}

function flatSeriesHeight(value: number): number {
	if (value === 0) {
		return MIN_BAR_HEIGHT_PERCENT;
	}

	return FLAT_SERIES_HEIGHT_PERCENT;
}
