import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vitest';

import { buildMetricSparklineBars, type MetricSparklineInput } from './buildMetricSparklineBars';

const t = ((key: string) => key) as unknown as TFunction;
const TIMESTAMPS = ['2026-09-26T12:00:00Z', '2026-09-26T12:00:10Z', '2026-09-26T12:00:20Z', '2026-09-26T12:00:30Z', '2026-09-26T12:00:40Z'];

function bars(values: readonly (number | null)[]) {
	const input: MetricSparklineInput = { values, timestamps: TIMESTAMPS, formatValue: String, locale: 'pt-BR', t };

	return buildMetricSparklineBars(input);
}

describe('buildMetricSparklineBars', () => {
	it('scales to the series own min and max, with a visible floor', () => {
		expect(bars([0, 50, 100, 25, 75]).map((bar) => bar.heightPercent)).toEqual([6, 50, 100, 25, 75]);
	});

	it('marks the gaps', () => {
		const result = bars([10, null, 20, 30, 40]);

		expect(result[1]).toMatchObject({ hasValue: false, heightPercent: 6, tooltip: 'metricTile.noDataTooltip' });
		expect(result[0]?.tooltip).toBe('metricTile.valueTooltip');
	});

	it('draws a flat series at the floor when it is all zeros, mid-height otherwise', () => {
		expect(bars([0, 0, 0, 0, 0]).map((bar) => bar.heightPercent)).toEqual([6, 6, 6, 6, 6]);
		expect(bars([3, 3, 3, 3, 3]).map((bar) => bar.heightPercent)).toEqual([50, 50, 50, 50, 50]);
		expect(bars([null, null, null, null, null]).every((bar) => !bar.hasValue)).toBe(true);
	});
});
