import { describe, expect, it } from 'vitest';

import { checkUpstreamUrl, EMPTY_INSTANCE_FORM, toInstanceInput, validateInstanceForm } from './instanceFormValidation';

describe('instance form', () => {
	it.each([
		['http://localhost:48101', null],
		['https://orders.internal/base', null],
		['http://', 'common.validation.required'],
		['ftp://x', 'services.instanceForm.errors.url'],
		['not a url', 'services.instanceForm.errors.url'],
		['http://user:pw@host', 'services.instanceForm.errors.url'],
		['http://host?x=1', 'services.instanceForm.errors.url'],
		['http://host#top', 'services.instanceForm.errors.url'],
	])('checks the URL %s', (url, expected) => {
		expect(checkUpstreamUrl(url)).toBe(expected);
	});

	it('checks the name and the weight, and trims the URL', () => {
		expect(validateInstanceForm({ ...EMPTY_INSTANCE_FORM, name: 'Orders 4', url: 'http://x', weight: '101' })).toEqual({
			name: 'common.validation.slug',
			url: undefined,
			weight: 'common.validation.range',
		});
		expect(toInstanceInput({ name: ' orders-4 ', url: 'http://x:1/ ', weight: '3' })).toEqual({ name: 'orders-4', url: 'http://x:1', weight: 3 });
	});
});
