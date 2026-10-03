// Route path prefixes: "/" or "/segment[/segment...]", lowercase letters,
// digits, "-" and "_" only, no trailing slash.
export const PATH_PREFIX_PATTERN = /^\/(?:[a-z0-9_-]+(?:\/[a-z0-9_-]+)*)?$/;
export const MAX_PATH_PREFIX_LENGTH = 200;
export const ROOT_PATH_PREFIX = '/';

export function isValidPathPrefix(value: string): boolean {
	return value.length <= MAX_PATH_PREFIX_LENGTH && PATH_PREFIX_PATTERN.test(value);
}

// True when path is the prefix itself or sits below it on a segment
// boundary: "/api/orders" matches "/api/orders/1" but not "/api/ordersx".
export function matchesPrefix(path: string, prefix: string): boolean {
	if (prefix === ROOT_PATH_PREFIX) {
		return true;
	}

	if (!path.startsWith(prefix)) {
		return false;
	}

	const isExactMatch = path.length === prefix.length;

	return isExactMatch || path.charAt(prefix.length) === '/';
}
