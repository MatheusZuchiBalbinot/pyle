import type { ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
	ChaosDisabledError,
	ChaosInstanceUnreachableError,
	ConfigConflictError,
	ConfigNotFoundError,
	ConfigValidationError,
} from '../domain/config-errors.js';
import { ConfigErrorFilter } from './config-error.filter.js';

function buildHost(): { readonly host: ArgumentsHost; readonly status: ReturnType<typeof vi.fn>; readonly json: ReturnType<typeof vi.fn> } {
	const json = vi.fn();
	const status = vi.fn().mockReturnValue({ json });
	const host = { switchToHttp: () => ({ getResponse: () => ({ status }) }) } as unknown as ArgumentsHost;

	return { host, status, json };
}

describe('ConfigErrorFilter', () => {
	it.each([
		[new ConfigNotFoundError('missing'), 404, 'Not Found'],
		[new ConfigConflictError('taken'), 409, 'Conflict'],
		[new ConfigValidationError('bad'), 400, 'Bad Request'],
		[new ChaosDisabledError('off'), 403, 'Forbidden'],
		[new ChaosInstanceUnreachableError('down'), 502, 'Bad Gateway'],
	])('maps %s to %i', (error, statusCode, label) => {
		const { host, status, json } = buildHost();

		new ConfigErrorFilter().catch(error, host);

		expect(status).toHaveBeenCalledWith(statusCode);
		expect(json).toHaveBeenCalledWith({ statusCode, message: error.message, error: label });
	});
});
