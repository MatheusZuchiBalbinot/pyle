import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { getTrafficOverview, listConsumers } from '@/app/api/adminApiClient';
import type { Consumer, TopConsumer, TrafficOverview } from '@/app/api/adminApiTypes';
import { isEntityChange, type RealtimeEvent } from '@/app/api/realtimeEvents';
import { useGateway } from '@/app/core/gateway/useGateway';
import { queryKeys } from '@/app/core/query/queryKeys';
import { useLiveTraffic } from '@/app/features/traffic/hooks/useLiveTraffic';
import { usePaginatedResource, type PaginatedState, type UsePaginatedResourceOptions } from '@/app/hooks/usePaginatedResource';
import { LOAD_STATUS } from '@/app/lib/loadStatus';
import { normalizeForSearch } from '@/app/shell/lib/consoleSearch';

const CONSUMER_SEARCH_DEBOUNCE_MS = 150;
const USAGE_WINDOW = '1h';

export type ConsumerRow = {
	readonly consumer: Consumer;
	// Null outside the top 10 of the last hour (the overview's list).
	readonly usage: TopConsumer | null;
};

export type ConsumersPageState = {
	readonly rows: PaginatedState<ConsumerRow>;
	readonly isLoadingMore: boolean;
	readonly loadMore: () => void;
	readonly query: string;
	readonly setQuery: (query: string) => void;
	readonly expandedSlug: string | null;
	readonly toggleConsumer: (slug: string) => void;
};

export function matchesConsumer(consumer: Consumer, query: string): boolean {
	const needle = normalizeForSearch(query);

	if (needle === '') {
		return true;
	}

	return normalizeForSearch(consumer.name).includes(needle) || consumer.slug.includes(needle);
}

export function useConsumersPage(): ConsumersPageState {
	const { t } = useTranslation();
	const { selection, openSelection, clearSelection } = useGateway();
	const listOptions: UsePaginatedResourceOptions = {
		queryKey: queryKeys.consumers(),
		fallbackErrorMessage: t('consumers.loadError'),
		refetchOn: isConsumerChange,
	};
	const { loadState, isLoadingMore, loadMore } = usePaginatedResource(listConsumers, listOptions);
	const usage = useLiveTraffic(loadUsage, {
		queryKey: queryKeys.trafficOverview(USAGE_WINDOW),
		fallbackErrorMessage: t('consumers.usageError'),
	}).loadState;
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), CONSUMER_SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [query]);

	// The open consumer is part of the URL (/consumers/:slug), so it can be linked to.
	const expandedSlug = selection?.type === 'consumer' ? selection.consumerSlug : null;
	const toggleConsumer = useCallback(
		(slug: string) => {
			if (slug === expandedSlug) {
				return clearSelection();
			}

			openSelection({ type: 'consumer', consumerSlug: slug });
		},
		[expandedSlug, openSelection, clearSelection],
	);

	const rows = useMemo((): PaginatedState<ConsumerRow> => {
		if (loadState.status !== LOAD_STATUS.loaded) {
			return loadState;
		}

		const topConsumers = usage.status === LOAD_STATUS.loaded ? usage.data.topConsumers : [];
		const usageById = new Map(topConsumers.map((entry) => [entry.consumerId, entry]));
		const items = loadState.items
			.filter((consumer) => matchesConsumer(consumer, debouncedQuery))
			.map((consumer) => ({ consumer, usage: usageById.get(consumer.id) ?? null }));

		return { status: LOAD_STATUS.loaded, items, hasMore: loadState.hasMore };
	}, [loadState, usage, debouncedQuery]);

	return { rows, isLoadingMore, loadMore, query, setQuery, expandedSlug, toggleConsumer };
}

function isConsumerChange(event: RealtimeEvent): boolean {
	return isEntityChange(event, ['Consumer', 'ApiKey']);
}

function loadUsage(): Promise<TrafficOverview> {
	return getTrafficOverview({ window: USAGE_WINDOW });
}
