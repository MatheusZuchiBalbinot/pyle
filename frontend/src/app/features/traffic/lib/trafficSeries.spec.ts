import { describe, expect, it } from 'vitest';

import { buildTrafficPoint } from '@/test/gatewayFixtures';

import { settledPoints } from './trafficSeries';

describe('settledPoints', () => {
	it('drops the steps whose buckets may not be flushed yet', () => {
		const window = { from: '2026-09-26T12:00:00.000Z', to: '2026-09-26T12:01:05.000Z', stepSeconds: 10 };
		const series = ['12:00:30', '12:00:40', '12:00:50', '12:01:00'].map((time) => buildTrafficPoint(`2026-09-26T${time}.000Z`));

		expect(settledPoints(series, window).map((point) => point.at.slice(11, 19))).toEqual(['12:00:30', '12:00:40']);
	});
});
