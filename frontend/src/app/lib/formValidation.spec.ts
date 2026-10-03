import { describe, expect, it } from 'vitest';

import { changedFields, checkInteger, checkLength, checkOptionalInteger, hasErrors, toOptionalInteger } from './formValidation';

describe('form validation', () => {
	it('checks integers against a range', () => {
		expect(checkInteger('', { min: 1, max: 10 })).toBe('common.validation.required');
		expect(checkInteger('1.5', { min: 1, max: 10 })).toBe('common.validation.integer');
		expect(checkInteger('abc', { min: 1, max: 10 })).toBe('common.validation.integer');
		expect(checkInteger('11', { min: 1, max: 10 })).toBe('common.validation.range');
		expect(checkInteger(' 10 ', { min: 1, max: 10 })).toBeNull();
	});

	it('lets an optional integer be empty', () => {
		expect(checkOptionalInteger('  ', { min: 1, max: 10 })).toBeNull();
		expect(checkOptionalInteger('0', { min: 1, max: 10 })).toBe('common.validation.range');
		expect(toOptionalInteger('')).toBeNull();
		expect(toOptionalInteger(' 42 ')).toBe(42);
	});

	it('checks text length, trimmed', () => {
		expect(checkLength('  ', { min: 1, max: 3 })).toBe('common.validation.required');
		expect(checkLength('abcd', { min: 1, max: 3 })).toBe('common.validation.length');
		expect(checkLength('abc', { min: 1, max: 3 })).toBeNull();
	});

	it('knows when a form has errors and what changed', () => {
		expect(hasErrors({ name: undefined })).toBe(false);
		expect(hasErrors({ name: 'x' })).toBe(true);
		expect(changedFields({ a: 1, b: ['x'], c: null }, { a: 1, b: ['y'], c: null })).toEqual({ b: ['y'] });
	});
});
