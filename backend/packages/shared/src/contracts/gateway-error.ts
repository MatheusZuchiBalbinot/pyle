// The body never carries internal detail (instance URL, socket error); that goes to the
// log.
export const GATEWAY_ERROR_CODES = [
	'route_not_found',
	'method_not_allowed',
	'missing_api_key',
	'invalid_api_key',
	'route_not_allowed',
	'rate_limited',
	'no_healthy_instance',
	'upstream_unreachable',
	'upstream_timeout',
	'gateway_not_ready',
	'internal_error',
] as const;
export type GatewayErrorCode = (typeof GATEWAY_ERROR_CODES)[number];

export const GATEWAY_ERROR_STATUS: Readonly<Record<GatewayErrorCode, number>> = {
	route_not_found: 404,
	method_not_allowed: 405,
	missing_api_key: 401,
	invalid_api_key: 401,
	route_not_allowed: 403,
	rate_limited: 429,
	no_healthy_instance: 503,
	upstream_unreachable: 502,
	upstream_timeout: 504,
	gateway_not_ready: 503,
	internal_error: 500,
};

export const GATEWAY_ERROR_MESSAGE: Readonly<Record<GatewayErrorCode, string>> = {
	route_not_found: 'No route matches this path',
	method_not_allowed: 'This route does not accept this method',
	missing_api_key: 'This route requires an API key (Authorization: Bearer <key>)',
	invalid_api_key: 'The API key is unknown or revoked',
	route_not_allowed: 'This API key may not call this route',
	rate_limited: 'Rate limit exceeded',
	no_healthy_instance: 'No healthy instance is available for this route',
	upstream_unreachable: 'The upstream service could not be reached',
	upstream_timeout: 'The upstream service did not answer in time',
	gateway_not_ready: 'The gateway is starting and has not loaded its configuration yet',
	internal_error: 'The gateway failed to handle this request',
};

// The gateway-made errors counted as gateway errors in traffic samples.
export const GATEWAY_FAILURE_CODES: ReadonlySet<GatewayErrorCode> = new Set(['no_healthy_instance', 'upstream_unreachable', 'upstream_timeout']);

export type RateLimitScope = 'consumer' | 'route';

export type GatewayErrorBody = {
	readonly error: GatewayErrorCode;
	readonly message: string;
	readonly requestId: string;
	// Only on rate_limited.
	readonly scope?: RateLimitScope;
};

export function buildGatewayErrorBody(code: GatewayErrorCode, requestId: string): GatewayErrorBody {
	return { error: code, message: GATEWAY_ERROR_MESSAGE[code], requestId };
}

export function buildRateLimitedBody(scope: RateLimitScope, requestId: string): GatewayErrorBody {
	return { ...buildGatewayErrorBody('rate_limited', requestId), scope };
}
