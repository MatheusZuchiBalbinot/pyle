import type { Consumer, Route, Service } from '@/app/api/adminApiTypes';
import type { ConsoleSelection } from '@/app/core/gateway/gatewayContext';

export type SearchResultKind = 'route' | 'service' | 'instance' | 'consumer';

export type SearchResult = {
	readonly kind: SearchResultKind;
	readonly id: string;
	readonly title: string;
	readonly detail: string;
	readonly selection: ConsoleSelection;
};

export type SearchCatalog = {
	readonly services: readonly Service[];
	readonly routes: readonly Route[];
	readonly consumers: readonly Consumer[];
};

type Candidate = SearchResult & { readonly haystack: readonly string[] };

export const MAX_SEARCH_RESULTS = 12;

// Case and accent insensitive: "usuario" finds "Usuários".
export function normalizeForSearch(text: string): string {
	return text
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim();
}

// Matches at the start of a name come first, then the rest, in catalog order.
export function searchConsole(rawQuery: string, catalog: SearchCatalog): readonly SearchResult[] {
	const query = normalizeForSearch(rawQuery);

	if (query === '') {
		return [];
	}

	const ranked = candidatesOf(catalog).flatMap((candidate) => {
		const rank = matchRank(candidate, query);

		return rank === null ? [] : [{ candidate, rank }];
	});
	const ordered = ranked.sort((left, right) => left.rank - right.rank);

	return ordered.slice(0, MAX_SEARCH_RESULTS).map(({ candidate }) => {
		const { haystack: _haystack, ...result } = candidate;

		return result;
	});
}

function candidatesOf(catalog: SearchCatalog): readonly Candidate[] {
	const routes = catalog.routes.map((route): Candidate => ({
		kind: 'route',
		id: route.id,
		title: route.name,
		detail: route.pathPrefix,
		selection: { type: 'route', routeId: route.id },
		haystack: [route.name, route.pathPrefix],
	}));
	const services = catalog.services.map((service): Candidate => ({
		kind: 'service',
		id: service.id,
		title: service.name,
		detail: service.slug,
		selection: { type: 'service', serviceSlug: service.slug, instanceId: null },
		haystack: [service.name, service.slug],
	}));
	const instances = catalog.services.flatMap((service) =>
		service.instances.map((instance): Candidate => ({
			kind: 'instance',
			id: instance.id,
			title: instance.name,
			detail: service.name,
			selection: { type: 'service', serviceSlug: service.slug, instanceId: instance.id },
			haystack: [instance.name, instance.url],
		})),
	);
	const consumers = catalog.consumers.map((consumer): Candidate => ({
		kind: 'consumer',
		id: consumer.id,
		title: consumer.name,
		detail: consumer.slug,
		selection: { type: 'consumer', consumerSlug: consumer.slug },
		haystack: [consumer.name, consumer.slug],
	}));

	return [...routes, ...services, ...instances, ...consumers];
}

// 0 for a match at the start of a field, 1 inside one, null for none.
function matchRank(candidate: Candidate, query: string): number | null {
	const fields = candidate.haystack.map(normalizeForSearch);

	if (fields.some((field) => field.startsWith(query))) {
		return 0;
	}

	if (fields.some((field) => field.includes(query))) {
		return 1;
	}

	return null;
}
