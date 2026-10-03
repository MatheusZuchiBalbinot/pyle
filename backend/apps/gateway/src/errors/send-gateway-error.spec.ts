import type { ServerResponse } from 'node:http';
import { describe, expect, it, vi } from 'vitest';

import { sendGatewayError } from './send-gateway-error.js';

function buildResponse(headersSent = false) {
	return { headersSent, writeHead: vi.fn(), end: vi.fn(), destroy: vi.fn() };
}

describe('sendGatewayError', () => {
	it('answers the contract body with its status and headers', () => {
		const response = buildResponse();

		sendGatewayError(response as unknown as ServerResponse, { code: 'method_not_allowed', requestId: 'r1', headers: { allow: 'GET' } });

		const payload = JSON.stringify({ error: 'method_not_allowed', message: 'This route does not accept this method', requestId: 'r1' });

		expect(response.writeHead).toHaveBeenCalledWith(405, {
			allow: 'GET',
			'content-type': 'application/json',
			'content-length': Buffer.byteLength(payload),
		});
		expect(response.end).toHaveBeenCalledWith(payload);
	});

	it('says which limit was hit', () => {
		const response = buildResponse();

		sendGatewayError(response as unknown as ServerResponse, { code: 'rate_limited', requestId: 'r1', scope: 'consumer' });

		expect(JSON.parse(response.end.mock.calls[0][0] as string)).toMatchObject({ error: 'rate_limited', scope: 'consumer' });
	});

	it('cuts the connection when the upstream status is already sent', () => {
		const response = buildResponse(true);

		sendGatewayError(response as unknown as ServerResponse, { code: 'upstream_timeout', requestId: 'r1' });

		expect(response.destroy).toHaveBeenCalled();
		expect(response.writeHead).not.toHaveBeenCalled();
	});
});
