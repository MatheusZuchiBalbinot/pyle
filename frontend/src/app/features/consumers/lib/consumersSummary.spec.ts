import { describe, expect, it } from 'vitest';

import type { Consumer, TopConsumer } from '@/app/api/adminApiTypes';
import type { ConsumerRow } from '@/app/features/consumers/hooks/useConsumersPage';

import { summarizeConsumers } from './consumersSummary';

const AT = '2026-10-03T12:00:00.000Z';

function row(name: string, keys: readonly (string | null)[], usage: Pick<TopConsumer, 'requestCount' | 'rateLimitedCount'> | null): ConsumerRow {
	const consumer: Consumer = {
		id: `id-${name}`,
		slug: name,
		name,
		rateLimitPerMinute: 600,
		allowedRoutes: [],
		apiKeys: keys.map((revokedAt, index) => ({
			id: `${name}-${index}`,
			keyPrefix: 'pyle_live_x',
			label: null,
			createdAt: AT,
			lastUsedAt: null,
			revokedAt,
		})),
		createdAt: AT,
		updatedAt: AT,
	};
	const topConsumer: TopConsumer | null = usage === null ? null : { consumerId: consumer.id, slug: name, name, ...usage };

	return { consumer, usage: topConsumer };
}

describe('summarizeConsumers', () => {
	it('adds up keys and usage and names the busiest and most limited consumer', () => {
		const rows = [
			row('web', [null, AT], { requestCount: 900, rateLimitedCount: 0 }),
			row('partner', [null], { requestCount: 300, rateLimitedCount: 120 }),
			row('old', [AT], null),
		];

		expect(summarizeConsumers(rows)).toEqual({
			consumerCount: 3,
			activeKeyCount: 2,
			requestCount: 1200,
			rateLimitedCount: 120,
			busiest: { name: 'web', count: 900 },
			mostLimited: { name: 'partner', count: 120 },
		});
	});

	it('names nobody when there was no usage', () => {
		const summary = summarizeConsumers([row('web', [null], null)]);

		expect(summary.busiest).toBeNull();
		expect(summary.mostLimited).toBeNull();
	});
});
