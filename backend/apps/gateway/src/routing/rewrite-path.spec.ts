import { describe, expect, it } from 'vitest';

import { rewritePath, splitRequestTarget } from './rewrite-path.js';

describe('splitRequestTarget', () => {
	it.each([
		['/api/orders/42?x=1&y=%2F', '/api/orders/42', '?x=1&y=%2F'],
		['/api/orders', '/api/orders', ''],
		['/a?b?c', '/a', '?b?c'],
		['', '/', ''],
		['/api/orders/../users', '/api/users', ''],
		['/api/./orders//x', '/api/orders//x', ''],
		['/api/orders/%2F42', '/api/orders/%2F42', ''],
	])('splits %j into path %j and query %j', (rawUrl, path, query) => {
		expect(splitRequestTarget(rawUrl)).toEqual({ path, query });
	});
});

describe('rewritePath', () => {
	it.each([
		['/api/orders/42', '/api/orders', true, '/42'],
		['/api/orders', '/api/orders', true, '/'],
		['/api/orders/42', '/api/orders', false, '/api/orders/42'],
		['/anything', '/', true, '/anything'],
		['/api/public/health', '/api/public/health', false, '/api/public/health'],
	])('%s under %s (strip=%s) reaches the instance as %s', (path, pathPrefix, stripPrefix, expected) => {
		expect(rewritePath({ path, pathPrefix, stripPrefix })).toBe(expected);
	});
});
