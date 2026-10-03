import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';

import {
	buildGatewayErrorBody,
	buildRateLimitedBody,
	GATEWAY_ERROR_STATUS,
	type GatewayErrorCode,
	type RateLimitScope,
} from '@pyle/shared/contracts/gateway-error.js';

const JSON_CONTENT_TYPE = 'application/json';

type GatewayErrorResponse = {
	readonly code: GatewayErrorCode;
	readonly requestId: string;
	readonly headers?: OutgoingHttpHeaders;
	// Only for rate_limited.
	readonly scope?: RateLimitScope;
};

// Once the upstream's status line is on the wire, the connection is cut instead.
export function sendGatewayError(response: ServerResponse, error: GatewayErrorResponse): void {
	if (response.headersSent) {
		response.destroy();

		return;
	}

	const body = error.scope ? buildRateLimitedBody(error.scope, error.requestId) : buildGatewayErrorBody(error.code, error.requestId);
	const payload = JSON.stringify(body);

	response.writeHead(GATEWAY_ERROR_STATUS[error.code], {
		...error.headers,
		'content-type': JSON_CONTENT_TYPE,
		'content-length': Buffer.byteLength(payload),
	});
	response.end(payload);
}
