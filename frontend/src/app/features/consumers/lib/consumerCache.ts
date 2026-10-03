import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { Consumer, Page } from '@/app/api/adminApiTypes';
import { queryKeys } from '@/app/core/query/queryKeys';

// Both cached lists that show a consumer (the Consumers page and the config list), for the
// optimistic edits: snapshot them, write the edited consumer, put the snapshot back on error.

export type ConsumersSnapshot = {
	readonly pages: ConsumerPages | undefined;
	readonly list: readonly Consumer[] | undefined;
};

type ConsumerPages = InfiniteData<Page<Consumer>, string | null>;

// Realtime refetches of the Consumers page wait while a mutation keyed on it is pending.
export const CONSUMER_PAGES_KEY = queryKeys.consumers();
const CONSUMER_LIST_KEY = queryKeys.configList('consumers');

// Stops in-flight fetches first, so none lands on top of the optimistic value.
export async function takeConsumersSnapshot(queryClient: QueryClient): Promise<ConsumersSnapshot> {
	await Promise.all([queryClient.cancelQueries({ queryKey: CONSUMER_PAGES_KEY }), queryClient.cancelQueries({ queryKey: CONSUMER_LIST_KEY })]);

	return {
		pages: queryClient.getQueryData<ConsumerPages>(CONSUMER_PAGES_KEY),
		list: queryClient.getQueryData<readonly Consumer[]>(CONSUMER_LIST_KEY),
	};
}

// Writes over the snapshot, so a rollback lands on what was there before.
export function writeConsumer(queryClient: QueryClient, snapshot: ConsumersSnapshot, consumer: Consumer): void {
	if (snapshot.pages !== undefined) {
		const pages = snapshot.pages.pages.map((page) => ({ ...page, items: replaceConsumer(page.items, consumer) }));

		queryClient.setQueryData<ConsumerPages>(CONSUMER_PAGES_KEY, { ...snapshot.pages, pages });
	}

	if (snapshot.list !== undefined) {
		queryClient.setQueryData<readonly Consumer[]>(CONSUMER_LIST_KEY, replaceConsumer(snapshot.list, consumer));
	}
}

export async function invalidateConsumers(queryClient: QueryClient): Promise<void> {
	await Promise.all([
		queryClient.invalidateQueries({ queryKey: CONSUMER_PAGES_KEY }),
		queryClient.invalidateQueries({ queryKey: CONSUMER_LIST_KEY }),
	]);
}

function replaceConsumer(consumers: readonly Consumer[], replacement: Consumer): readonly Consumer[] {
	return consumers.map((consumer) => (consumer.id === replacement.id ? replacement : consumer));
}
