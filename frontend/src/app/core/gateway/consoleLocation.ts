import { assertUnreachable } from '@/app/lib/assertUnreachable';
import { DEFAULT_PAGE_ID, type PageId } from '@/app/shell/Sidebar/navItems';

import { pageForSelection } from './consoleSelection';
import type { ConsoleSelection } from './gatewayContext';

// Where the console is: a page and, on it, at most one opened entity. The URL holds both,
// so a reload lands on the same place, the browser's back button works and a route,
// instance, consumer or analysis can be linked to.
//
//   /                                    overview
//   /traffic, /traffic/routes/:routeId   traffic, all routes or one
//   /routes, /routes/:routeId
//   /services, /services/:slug, /services/:slug/instances/:instanceId
//   /consumers, /consumers/:slug
//   /assistant, /ai, /ai/:analysisId, /settings
export type ConsoleLocation = { readonly page: PageId; readonly selection: ConsoleSelection | null };

const PATH_BY_PAGE: Readonly<Record<PageId, string>> = {
	overview: '/',
	traffic: '/traffic',
	routes: '/routes',
	services: '/services',
	consumers: '/consumers',
	assistant: '/assistant',
	ai: '/ai',
	settings: '/settings',
};

const PAGE_BY_FIRST_SEGMENT: ReadonlyMap<string, PageId> = new Map(
	Object.entries(PATH_BY_PAGE)
		.filter(([page]) => page !== DEFAULT_PAGE_ID)
		.map(([page, path]) => [path.slice(1), page as PageId]),
);

const TRAFFIC_ROUTES_SEGMENT = 'routes';
const SERVICE_INSTANCES_SEGMENT = 'instances';

export function locationOfPage(page: PageId): ConsoleLocation {
	return { page, selection: null };
}

export function locationOfSelection(selection: ConsoleSelection): ConsoleLocation {
	return { page: pageForSelection(selection), selection };
}

export function toConsolePath(location: ConsoleLocation): string {
	const { selection } = location;

	if (selection === null) {
		return PATH_BY_PAGE[location.page];
	}

	return toSelectionPath(selection);
}

// Anything it does not recognize falls back to the overview.
export function parseConsolePath(pathname: string): ConsoleLocation {
	const segments = pathname
		.split('/')
		.filter((segment) => segment !== '')
		.map(decodeSegment);
	const [first = '', ...rest] = segments;
	const page = PAGE_BY_FIRST_SEGMENT.get(first);

	if (page === undefined) {
		return locationOfPage(DEFAULT_PAGE_ID);
	}

	const selection = parseSelection(page, rest);

	if (selection === undefined) {
		return locationOfPage(page);
	}

	return { page, selection };
}

function toSelectionPath(selection: ConsoleSelection): string {
	switch (selection.type) {
		case 'route':
			return joinPath(PATH_BY_PAGE.routes, selection.routeId);
		case 'route-traffic':
			return joinPath(PATH_BY_PAGE.traffic, TRAFFIC_ROUTES_SEGMENT, selection.routeId);
		case 'service':
			return selection.instanceId === null
				? joinPath(PATH_BY_PAGE.services, selection.serviceSlug)
				: joinPath(PATH_BY_PAGE.services, selection.serviceSlug, SERVICE_INSTANCES_SEGMENT, selection.instanceId);
		case 'consumer':
			return joinPath(PATH_BY_PAGE.consumers, selection.consumerSlug);
		case 'analysis':
			return joinPath(PATH_BY_PAGE.ai, selection.analysisId);
		default:
			return assertUnreachable(selection);
	}
}

// undefined: the page itself, with nothing opened (also for a path it cannot read).
function parseSelection(page: PageId, rest: readonly string[]): ConsoleSelection | undefined {
	const [id, nested, nestedId] = rest;

	if (id === undefined) {
		return undefined;
	}

	switch (page) {
		case 'routes':
			return { type: 'route', routeId: id };
		case 'traffic':
			return parseTrafficSelection(id, nested);
		case 'services':
			return parseServiceSelection(id, nested, nestedId);
		case 'consumers':
			return { type: 'consumer', consumerSlug: id };
		case 'ai':
			return { type: 'analysis', analysisId: id };
		case 'overview':
		case 'assistant':
		case 'settings':
			return undefined;
		default:
			return assertUnreachable(page);
	}
}

function parseTrafficSelection(segment: string, routeId: string | undefined): ConsoleSelection | undefined {
	const isRouteTraffic = segment === TRAFFIC_ROUTES_SEGMENT && routeId !== undefined;

	if (!isRouteTraffic) {
		return undefined;
	}

	return { type: 'route-traffic', routeId };
}

function parseServiceSelection(serviceSlug: string, segment: string | undefined, instanceId: string | undefined): ConsoleSelection {
	const isInstance = segment === SERVICE_INSTANCES_SEGMENT && instanceId !== undefined;

	return { type: 'service', serviceSlug, instanceId: isInstance ? instanceId : null };
}

function joinPath(base: string, ...segments: readonly string[]): string {
	return [base, ...segments.map(encodeURIComponent)].join('/');
}

// A malformed escape (a hand-typed %) is read as is rather than thrown.
function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}
