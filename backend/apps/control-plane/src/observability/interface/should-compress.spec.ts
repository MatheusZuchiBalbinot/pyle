import type { Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { shouldCompress } from './should-compress.js';

function buildExchange(contentType: string): { request: Request; response: Response } {
	const request = { headers: { 'accept-encoding': 'gzip' } } as unknown as Request;
	const response = { getHeader: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : undefined) } as unknown as Response;

	return { request, response };
}

describe('shouldCompress', () => {
	it('compresses JSON responses', () => {
		const { request, response } = buildExchange('application/json; charset=utf-8');

		expect(shouldCompress(request, response)).toBe(true);
	});

	it('leaves a server-sent event stream alone', () => {
		const { request, response } = buildExchange('text/event-stream');

		expect(shouldCompress(request, response)).toBe(false);
	});
});
