import { describe, expect, it } from 'vitest';

import { InvalidUpstreamUrlError, MAX_UPSTREAM_URL_LENGTH, parseUpstreamUrl } from './upstream-url.js';

describe('parseUpstreamUrl', () => {
	it.each([
		['https://api.acme.test', 'https://api.acme.test'],
		['  http://localhost:8080/  ', 'http://localhost:8080'],
		['https://acme.test/api/v1///', 'https://acme.test/api/v1'],
	])('normalizes %s', (raw, expected) => {
		expect(parseUpstreamUrl(raw)).toBe(expected);
	});

	it.each([
		['', 'must be 1-'],
		['x'.repeat(MAX_UPSTREAM_URL_LENGTH + 1), 'must be 1-'],
		['not a url', 'not a valid URL'],
		['ftp://files.acme.test', 'http or https'],
		['https://user:secret@acme.test', 'must not carry credentials'],
		['https://acme.test/api?token=x', 'query string or fragment'],
		['https://acme.test/#top', 'query string or fragment'],
	])('refuses %s', (raw, message) => {
		expect(() => parseUpstreamUrl(raw)).toThrow(InvalidUpstreamUrlError);
		expect(() => parseUpstreamUrl(raw)).toThrow(message);
	});
});
