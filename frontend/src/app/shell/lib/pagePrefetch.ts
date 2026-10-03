import type { QueryClient } from '@tanstack/react-query';

import type { PrefetchableQuery } from '@/app/core/query/prefetchableQuery';
import { overviewQuery } from '@/app/features/overview/hooks/useOverview';
import { routesListTrafficQuery } from '@/app/features/routes/hooks/useRoutesPage';
import { servicesCapabilitiesQuery, servicesTrafficQuery } from '@/app/features/services/hooks/useServicesPage';
import { alertRulesQuery, platformSettingsQuery, systemHealthQuery } from '@/app/features/settings/lib/settingsQueries';
import { trafficPageQuery } from '@/app/features/traffic/hooks/useTrafficPage';
import { configListQuery } from '@/app/hooks/useConfigList';

import type { PageId } from '../Sidebar/navItems';

type PagePrefetch = (client: QueryClient) => Promise<void>;

// What each page shows first, fetched when the pointer or the focus reaches its sidebar
// entry: by the click, the page usually has its data and opens without a loading state.
// Pages whose first query depends on what the user does there (a filter, a cursor, a
// conversation) are left out rather than guessed.
const PREFETCH_BY_PAGE: Readonly<Record<PageId, PagePrefetch>> = {
	overview: (client) => client.prefetchQuery(overviewQuery()),
	traffic: (client) => client.prefetchQuery(trafficPageQuery()),
	routes: (client) => prefetchAll(client, [configListQuery('routes'), routesListTrafficQuery()]),
	services: prefetchServices,
	consumers: () => Promise.resolve(),
	assistant: () => Promise.resolve(),
	ai: () => Promise.resolve(),
	settings: (client) => prefetchAll(client, [platformSettingsQuery(), alertRulesQuery(), systemHealthQuery()]),
};

// Fresh data is not fetched again: prefetchQuery honours the client's staleTime.
export function prefetchPage(client: QueryClient, page: PageId): void {
	void PREFETCH_BY_PAGE[page](client);
}

async function prefetchAll(client: QueryClient, queries: readonly PrefetchableQuery[]): Promise<void> {
	await Promise.all(queries.map((query) => client.prefetchQuery(query)));
}

// The traffic cards are keyed by the services listed, so they wait for the list.
async function prefetchServices(client: QueryClient): Promise<void> {
	const list = configListQuery('services');
	const capabilities = client.prefetchQuery(servicesCapabilitiesQuery());
	const services = await client.fetchQuery(list);

	await Promise.all([capabilities, client.prefetchQuery(servicesTrafficQuery(services))]);
}
