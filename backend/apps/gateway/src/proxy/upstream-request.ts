import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'node:http';

import { TRACEPARENT_HEADER } from '../pipeline/trace-context.js';

// Headers that describe one connection, not the message: never forwarded in
// either direction (RFC 9110 §7.6.1), plus Host, which the instance gets
// from its own URL.
const HOP_BY_HOP_HEADERS: ReadonlySet<string> = new Set([
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade',
	'host',
]);

// The gateway's own business, never the instance's: the consumer's key
// authenticates the caller to the gateway, the chaos token must not be
// reachable through a route, and the identity headers are re-sent only as
// the gateway vouches for them (a client cannot spoof them).
// The caller's traceparent is replaced by one naming the gateway as the parent.
const GATEWAY_ONLY_HEADERS: ReadonlySet<string> = new Set([
	'authorization',
	'x-chaos-token',
	'x-pyle-consumer',
	'x-pyle-route',
	'x-request-id',
	'traceparent',
]);

const CONSUMER_HEADER = 'x-pyle-consumer';

export const ROUTE_HEADER = 'x-pyle-route';
export const REQUEST_ID_HEADER = 'x-request-id';

export type UpstreamRequestInput = {
	// The instance base URL, without a trailing slash.
	readonly instanceUrl: string;
	// The rewritten path, with its leading slash ("/42").
	readonly forwardedPath: string;
	// The raw query string with its "?", or "".
	readonly query: string;
	readonly headers: IncomingHttpHeaders;
	readonly consumerSlug: string | null;
	readonly routeName: string;
	readonly requestId: string;
	readonly traceparent: string;
	readonly clientIp: string;
	readonly protocol: string;
	readonly host: string | undefined;
};

export type UpstreamRequest = {
	readonly url: URL;
	readonly headers: OutgoingHttpHeaders;
};

// The request the gateway sends to an instance. The path is appended to the
// instance's base URL, never resolved against it, so no client path can
// move the request to another host.
export function buildUpstreamRequest(input: UpstreamRequestInput): UpstreamRequest {
	const url = new URL(`${input.instanceUrl}${input.forwardedPath}${input.query}`);
	const forwardedEntries = Object.entries(input.headers).filter(([name]) => isForwardable(name));
	const headers: OutgoingHttpHeaders = {
		...Object.fromEntries(forwardedEntries),
		'x-forwarded-for': appendForwardedFor(input.headers['x-forwarded-for'], input.clientIp),
		'x-forwarded-proto': input.protocol,
		...(input.host ? { 'x-forwarded-host': input.host } : {}),
		...(input.consumerSlug ? { [CONSUMER_HEADER]: input.consumerSlug } : {}),
		[ROUTE_HEADER]: input.routeName,
		[REQUEST_ID_HEADER]: input.requestId,
		[TRACEPARENT_HEADER]: input.traceparent,
	};

	return { url, headers };
}

export function toClientResponseHeaders(headers: IncomingHttpHeaders): OutgoingHttpHeaders {
	const entries = Object.entries(headers).filter(([name, value]) => value !== undefined && !HOP_BY_HOP_HEADERS.has(name));

	return Object.fromEntries(entries);
}

function appendForwardedFor(previous: string | string[] | undefined, clientIp: string): string {
	const earlier = Array.isArray(previous) ? previous.join(', ') : previous;

	return earlier ? `${earlier}, ${clientIp}` : clientIp;
}

function isForwardable(name: string): boolean {
	return !HOP_BY_HOP_HEADERS.has(name) && !GATEWAY_ONLY_HEADERS.has(name);
}
