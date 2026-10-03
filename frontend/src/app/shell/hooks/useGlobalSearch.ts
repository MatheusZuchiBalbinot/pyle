import { useEffect, useMemo, useState } from 'react';

import { useConfigList } from '@/app/hooks/useConfigList';
import { LOAD_STATUS } from '@/app/lib/loadStatus';

import { searchConsole, type SearchResult } from '../lib/consoleSearch';

export const SEARCH_DEBOUNCE_MS = 150;

export type GlobalSearchState = {
	readonly query: string;
	readonly setQuery: (query: string) => void;
	readonly results: readonly SearchResult[];
	// True until routes, services and consumers are all loaded.
	readonly isLoading: boolean;
};

// Debounced, so each keystroke does not re-rank.
export function useGlobalSearch(): GlobalSearchState {
	const [query, setQuery] = useState('');
	const [debouncedQuery, setDebouncedQuery] = useState('');
	const services = useConfigList('services').loadState;
	const routes = useConfigList('routes').loadState;
	const consumers = useConfigList('consumers').loadState;

	useEffect(() => {
		const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);

		return () => clearTimeout(timer);
	}, [query]);

	const isLoading = services.status === LOAD_STATUS.loading || routes.status === LOAD_STATUS.loading || consumers.status === LOAD_STATUS.loading;
	const results = useMemo(() => {
		const catalog = {
			services: services.status === LOAD_STATUS.loaded ? services.data : [],
			routes: routes.status === LOAD_STATUS.loaded ? routes.data : [],
			consumers: consumers.status === LOAD_STATUS.loaded ? consumers.data : [],
		};

		return searchConsole(debouncedQuery, catalog);
	}, [debouncedQuery, services, routes, consumers]);

	return { query, setQuery, results, isLoading };
}
