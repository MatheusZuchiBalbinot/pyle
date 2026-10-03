import { describe, expect, it } from 'vitest';

import { toErrorMessage } from './to-error-message.js';

describe('toErrorMessage', () => {
	it('returns the message of a real Error', () => {
		expect(toErrorMessage(new Error('something broke'))).toBe('something broke');
	});

	it('JSON-stringifies a non-Error value', () => {
		expect(toErrorMessage({ code: 'ECONNREFUSED' })).toBe('{"code":"ECONNREFUSED"}');
	});

	it('JSON-stringifies a plain string thrown as an error', () => {
		expect(toErrorMessage('a plain string throw')).toBe('"a plain string throw"');
	});
});
