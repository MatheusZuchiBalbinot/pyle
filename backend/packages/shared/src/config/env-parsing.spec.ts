import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBooleanEnv, readFractionEnv, readPortEnv, readPositiveIntEnv, readRequiredEnv } from './env-parsing.js';

const TEST_ENV_VAR = 'PYLE_TEST_ENV_PARSING_VAR';

describe('readRequiredEnv', () => {
	afterEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	it('returns the value when the variable is set', () => {
		process.env[TEST_ENV_VAR] = 'a-real-value';
		expect(readRequiredEnv(TEST_ENV_VAR)).toBe('a-real-value');
	});

	it('throws a clear error when the variable is missing', () => {
		expect(() => readRequiredEnv(TEST_ENV_VAR)).toThrow(`Missing required environment variable: ${TEST_ENV_VAR}`);
	});

	it('throws when the variable is set but empty', () => {
		process.env[TEST_ENV_VAR] = '';
		expect(() => readRequiredEnv(TEST_ENV_VAR)).toThrow(`Missing required environment variable: ${TEST_ENV_VAR}`);
	});
});

describe('readPositiveIntEnv', () => {
	const FALLBACK = 42;

	beforeEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	it('returns the fallback when the variable is unset', () => {
		expect(readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toBe(FALLBACK);
	});

	it('returns the parsed value when the variable is a valid positive integer', () => {
		process.env[TEST_ENV_VAR] = '100';
		expect(readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toBe(100);
	});

	// Present but invalid is an error, never a silent fallback to the default.
	it('refuses a value that is not a number, naming the variable and what it got', () => {
		process.env[TEST_ENV_VAR] = 'not-a-number';

		expect(() => readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toThrow(
			`Environment variable ${TEST_ENV_VAR} must be a positive integer (got "not-a-number")`,
		);
	});

	it('refuses a unit suffix, which is the typo that actually happens', () => {
		process.env[TEST_ENV_VAR] = '20s';

		expect(() => readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toThrow(/positive integer/);
	});

	it.each(['0', '-5'])('refuses %s, which no interval or pool size can be', (value) => {
		process.env[TEST_ENV_VAR] = value;

		expect(() => readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toThrow(/positive integer/);
	});

	it('refuses a non-integer number', () => {
		process.env[TEST_ENV_VAR] = '3.5';

		expect(() => readPositiveIntEnv(TEST_ENV_VAR, FALLBACK)).toThrow(/positive integer/);
	});
});

describe('readBooleanEnv', () => {
	beforeEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	afterEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	it('returns the fallback when unset', () => {
		expect(readBooleanEnv(TEST_ENV_VAR, true)).toBe(true);
	});

	it.each([
		['true', true],
		['false', false],
	])('parses %s', (raw, expected) => {
		process.env[TEST_ENV_VAR] = raw;
		expect(readBooleanEnv(TEST_ENV_VAR, !expected)).toBe(expected);
	});

	it.each(['1', 'yes', 'TRUE'])('rejects %s', (raw) => {
		process.env[TEST_ENV_VAR] = raw;
		expect(() => readBooleanEnv(TEST_ENV_VAR, false)).toThrow(TEST_ENV_VAR);
	});
});

describe('readFractionEnv', () => {
	beforeEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	afterEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	it('returns the fallback when unset', () => {
		expect(readFractionEnv(TEST_ENV_VAR, 0.05)).toBe(0.05);
	});

	it.each([
		['0', 0],
		['0.25', 0.25],
		['1', 1],
	])('parses %s', (raw, expected) => {
		process.env[TEST_ENV_VAR] = raw;
		expect(readFractionEnv(TEST_ENV_VAR, 0.5)).toBe(expected);
	});

	it.each(['-0.1', '1.5', 'abc', ' '])('rejects %j', (raw) => {
		process.env[TEST_ENV_VAR] = raw;
		expect(() => readFractionEnv(TEST_ENV_VAR, 0.5)).toThrow(TEST_ENV_VAR);
	});
});

describe('readPortEnv', () => {
	beforeEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	afterEach(() => {
		delete process.env[TEST_ENV_VAR];
	});

	it('accepts a valid port and rejects one out of range', () => {
		process.env[TEST_ENV_VAR] = '8080';
		expect(readPortEnv(TEST_ENV_VAR, 1)).toBe(8080);

		process.env[TEST_ENV_VAR] = '70000';
		expect(() => readPortEnv(TEST_ENV_VAR, 1)).toThrow(/TCP port/);
	});
});
