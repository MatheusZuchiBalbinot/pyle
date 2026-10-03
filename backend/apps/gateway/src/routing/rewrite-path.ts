import { ROOT_PATH_PREFIX } from '@pyle/shared/contracts/path-prefix.js';

const PARSE_BASE = 'http://gateway.invalid';
const QUERY_SEPARATOR = '?';

type RequestTarget = {
	// Dot segments resolved ("/api/orders/../users" is "/api/users"), so a
	// route prefix can't be sidestepped by walking out of it.
	readonly path: string;
	// The raw query string with its "?", or "": forwarded byte for byte.
	readonly query: string;
};

type RewriteInput = {
	readonly path: string;
	readonly pathPrefix: string;
	readonly stripPrefix: boolean;
};

export function splitRequestTarget(rawUrl: string): RequestTarget {
	const separatorIndex = rawUrl.indexOf(QUERY_SEPARATOR);
	const rawPath = separatorIndex === -1 ? rawUrl : rawUrl.slice(0, separatorIndex);
	const query = separatorIndex === -1 ? '' : rawUrl.slice(separatorIndex);
	const path = new URL(rawPath || '/', PARSE_BASE).pathname;

	return { path, query };
}

// The path the instance receives. With stripPrefix, "/api/orders" +
// "/api/orders/42" becomes "/42", and the prefix alone becomes "/".
export function rewritePath(input: RewriteInput): string {
	const isStripping = input.stripPrefix && input.pathPrefix !== ROOT_PATH_PREFIX;

	if (!isStripping) {
		return input.path;
	}

	const rest = input.path.slice(input.pathPrefix.length);

	return rest === '' ? '/' : rest;
}
