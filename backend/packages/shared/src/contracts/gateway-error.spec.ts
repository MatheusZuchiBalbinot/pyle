import { describe, expect, it } from 'vitest';

import { buildGatewayErrorBody, buildRateLimitedBody, GATEWAY_ERROR_CODES, GATEWAY_ERROR_MESSAGE, GATEWAY_ERROR_STATUS } from './gateway-error.js';

describe('gateway errors', () => {
	it.each(GATEWAY_ERROR_CODES)('%s has an HTTP error status and a message', (code) => {
		expect(GATEWAY_ERROR_STATUS[code]).toBeGreaterThanOrEqual(400);
		expect(GATEWAY_ERROR_MESSAGE[code].length).toBeGreaterThan(0);
	});

	it('carries the request id in the body', () => {
		expect(buildGatewayErrorBody('route_not_found', 'req-1')).toEqual({
			error: 'route_not_found',
			message: GATEWAY_ERROR_MESSAGE.route_not_found,
			requestId: 'req-1',
		});
	});

	it('says which limit was hit on rate_limited', () => {
		expect(buildRateLimitedBody('route', 'req-2')).toMatchObject({ error: 'rate_limited', scope: 'route', requestId: 'req-2' });
	});
});
