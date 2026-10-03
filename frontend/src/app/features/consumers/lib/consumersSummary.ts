import type { ConsumerRow } from '@/app/features/consumers/hooks/useConsumersPage';

export type ConsumerFigure = { readonly name: string; readonly count: number };

export type ConsumersSummary = {
	readonly consumerCount: number;
	readonly activeKeyCount: number;
	readonly requestCount: number;
	readonly rateLimitedCount: number;
	// Null when nobody called in the last hour.
	readonly busiest: ConsumerFigure | null;
	// Null when nobody was rate limited.
	readonly mostLimited: ConsumerFigure | null;
};

// The figures above the consumers table, from the rows it lists (usage: the last hour).
export function summarizeConsumers(rows: readonly ConsumerRow[]): ConsumersSummary {
	const requestFigures = rows.map((row) => toFigure(row, row.usage?.requestCount ?? 0));
	const limitedFigures = rows.map((row) => toFigure(row, row.usage?.rateLimitedCount ?? 0));

	return {
		consumerCount: rows.length,
		activeKeyCount: rows.reduce((sum, row) => sum + row.consumer.apiKeys.filter((key) => key.revokedAt === null).length, 0),
		requestCount: sumOf(requestFigures),
		rateLimitedCount: sumOf(limitedFigures),
		busiest: topOf(requestFigures),
		mostLimited: topOf(limitedFigures),
	};
}

function toFigure(row: ConsumerRow, count: number): ConsumerFigure {
	return { name: row.consumer.name, count };
}

function sumOf(figures: readonly ConsumerFigure[]): number {
	return figures.reduce((sum, figure) => sum + figure.count, 0);
}

function topOf(figures: readonly ConsumerFigure[]): ConsumerFigure | null {
	const top = figures.reduce<ConsumerFigure | null>((best, figure) => (best === null || figure.count > best.count ? figure : best), null);

	return top !== null && top.count > 0 ? top : null;
}
