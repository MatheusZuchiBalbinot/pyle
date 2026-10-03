import { describe, expect, it } from 'vitest';

import { isValidPathPrefix, matchesPrefix, MAX_PATH_PREFIX_LENGTH } from './path-prefix.js';

describe('isValidPathPrefix', () => {
	it.each(['/', '/api', '/api/orders', '/api/v2_beta/items-list'])('accepts %s', (prefix) => {
		expect(isValidPathPrefix(prefix)).toBe(true);
	});

	it.each(['', 'api', '/api/', '/API', '/a//b', '/a b', '/a?x', `/${'a'.repeat(MAX_PATH_PREFIX_LENGTH)}`])('rejects %j', (prefix) => {
		expect(isValidPathPrefix(prefix)).toBe(false);
	});
});

describe('matchesPrefix', () => {
	it.each([
		['/api/orders', '/api/orders', true],
		['/api/orders/1', '/api/orders', true],
		['/api/ordersx', '/api/orders', false],
		['/api', '/api/orders', false],
		['/anything/at/all', '/', true],
		['/', '/', true],
	])('%s under %s is %s', (path, prefix, expected) => {
		expect(matchesPrefix(path, prefix)).toBe(expected);
	});
});
