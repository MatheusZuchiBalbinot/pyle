import type { CreateRouteInput, HttpMethodName, Route } from '@/app/api/adminApiTypes';
import { checkLength, checkOptionalInteger, toOptionalInteger, type FieldErrors } from '@/app/lib/formValidation';

// Mirrors the backend's path-prefix rules; the server checks again.
const PATH_PREFIX_PATTERN = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/;
const MAX_PATH_PREFIX_LENGTH = 200;
const NAME_LENGTH = { min: 1, max: 100 };
const RATE_LIMIT_RANGE = { min: 1, max: 100_000 };
const TIMEOUT_RANGE = { min: 100, max: 60_000 };
const EXAMPLE_TAIL = '42';
const TRAILING_SLASHES = /\/+$/;

export type RouteFormValues = {
	readonly name: string;
	readonly pathPrefix: string;
	readonly serviceSlug: string;
	readonly stripPrefix: boolean;
	// Empty: every method.
	readonly methods: readonly HttpMethodName[];
	readonly isAuthRequired: boolean;
	// Text as typed; empty means "not set".
	readonly rateLimitPerMinute: string;
	readonly timeoutMs: string;
};

export type RouteFormField = keyof RouteFormValues;

export const EMPTY_ROUTE_FORM: RouteFormValues = {
	name: '',
	pathPrefix: '/api/',
	serviceSlug: '',
	stripPrefix: true,
	methods: [],
	isAuthRequired: true,
	rateLimitPerMinute: '',
	timeoutMs: '',
};

export type RewriteExample = { readonly incoming: string; readonly forwarded: string };

export function routeToFormValues(route: Route): RouteFormValues {
	return {
		name: route.name,
		pathPrefix: route.pathPrefix,
		serviceSlug: route.service.slug,
		stripPrefix: route.stripPrefix,
		methods: route.methods,
		isAuthRequired: route.isAuthRequired,
		rateLimitPerMinute: route.rateLimitPerMinute === null ? '' : String(route.rateLimitPerMinute),
		timeoutMs: route.timeoutMs === null ? '' : String(route.timeoutMs),
	};
}

export function validateRouteForm(values: RouteFormValues): FieldErrors<RouteFormField> {
	const errors: FieldErrors<RouteFormField> = {
		name: checkLength(values.name, NAME_LENGTH) ?? undefined,
		pathPrefix: checkPrefix(values.pathPrefix) ?? undefined,
		serviceSlug: values.serviceSlug === '' ? 'routes.form.errors.serviceRequired' : undefined,
		rateLimitPerMinute: checkOptionalInteger(values.rateLimitPerMinute, RATE_LIMIT_RANGE) ?? undefined,
		timeoutMs: checkOptionalInteger(values.timeoutMs, TIMEOUT_RANGE) ?? undefined,
	};

	return errors;
}

export function toRouteInput(values: RouteFormValues): CreateRouteInput {
	return {
		name: values.name.trim(),
		pathPrefix: values.pathPrefix.trim(),
		serviceSlug: values.serviceSlug,
		stripPrefix: values.stripPrefix,
		methods: values.methods,
		isAuthRequired: values.isAuthRequired,
		rateLimitPerMinute: toOptionalInteger(values.rateLimitPerMinute),
		timeoutMs: toOptionalInteger(values.timeoutMs),
	};
}

// "/api/orders/42 → /42" (stripping) or "/api/orders/42 → /api/orders/42".
export function describeRewrite(pathPrefix: string, stripPrefix: boolean): RewriteExample {
	// While typing, "/api/" is a prefix on its way to "/api/orders".
	const base = pathPrefix.trim().replace(TRAILING_SLASHES, '');
	const incoming = `${base}/${EXAMPLE_TAIL}`;

	if (!stripPrefix) {
		return { incoming, forwarded: incoming };
	}

	return { incoming, forwarded: `/${EXAMPLE_TAIL}` };
}

function checkPrefix(prefix: string): string | null {
	if (prefix.trim() === '') {
		return 'common.validation.required';
	}

	const isValid = prefix.length <= MAX_PATH_PREFIX_LENGTH && PATH_PREFIX_PATTERN.test(prefix);

	return isValid ? null : 'routes.form.errors.prefixFormat';
}
