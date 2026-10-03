const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

export const MAX_UPSTREAM_URL_LENGTH = 2048;

export class InvalidUpstreamUrlError extends Error {}

// Rejects what would make forwarding ambiguous or leak secrets: other schemes, credentials,
// a query string or a fragment.
export function parseUpstreamUrl(raw: string): string {
	const trimmed = raw.trim();

	if (trimmed.length === 0 || trimmed.length > MAX_UPSTREAM_URL_LENGTH) {
		throw new InvalidUpstreamUrlError(`The upstream URL must be 1-${MAX_UPSTREAM_URL_LENGTH} characters`);
	}

	const url = URL.canParse(trimmed) ? new URL(trimmed) : null;

	if (!url) {
		throw new InvalidUpstreamUrlError('The upstream URL is not a valid URL');
	}

	if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
		throw new InvalidUpstreamUrlError('The upstream URL must use http or https');
	}

	const hasCredentials = url.username !== '' || url.password !== '';

	if (hasCredentials) {
		throw new InvalidUpstreamUrlError('The upstream URL must not carry credentials');
	}

	const hasQueryOrFragment = url.search !== '' || url.hash !== '';

	if (hasQueryOrFragment) {
		throw new InvalidUpstreamUrlError('The upstream URL must not have a query string or fragment');
	}

	const basePath = url.pathname.replace(/\/+$/, '');

	return `${url.origin}${basePath}`;
}
