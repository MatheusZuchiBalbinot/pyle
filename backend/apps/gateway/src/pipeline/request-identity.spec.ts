import type { IncomingMessage } from 'node:http';
import { describe, expect, it } from 'vitest';

import { hasRequestBody, resolveClientIp, resolveRequestId } from './request-identity.js';

describe('resolveRequestId', () => {
	it('keeps a safe client id and replaces anything else', () => {
		expect(resolveRequestId('abc-123._x', () => 'new')).toBe('abc-123._x');
		expect(resolveRequestId('has spaces', () => 'new')).toBe('new');
		expect(resolveRequestId(['a', 'b'], () => 'new')).toBe('new');
		expect(resolveRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe('resolveClientIp', () => {
	it.each([
		['::ffff:10.0.0.1', '10.0.0.1'],
		['::1', '::1'],
		[undefined, 'unknown'],
	])('reads %s as %s', (remoteAddress, expected) => {
		expect(resolveClientIp({ socket: { remoteAddress } } as unknown as IncomingMessage)).toBe(expected);
	});
});

describe('hasRequestBody', () => {
	it.each([
		[{}, false],
		[{ 'content-length': '0' }, false],
		[{ 'content-length': '12' }, true],
		[{ 'transfer-encoding': 'chunked' }, true],
	])('%o → %s', (headers, expected) => {
		expect(hasRequestBody({ headers } as unknown as IncomingMessage)).toBe(expected);
	});
});
