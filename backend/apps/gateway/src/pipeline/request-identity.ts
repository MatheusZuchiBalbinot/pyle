import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

// A client-supplied request id is kept when it is safe to echo in logs and
// headers, so a caller can trace its own request end to end.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const IPV4_MAPPED_PREFIX = '::ffff:';
const UNKNOWN_CLIENT_IP = 'unknown';

export function resolveRequestId(incoming: string | string[] | undefined, generate: () => string = randomUUID): string {
	const isUsable = typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming);

	return isUsable ? incoming : generate();
}

// The gateway is the edge: an incoming X-Forwarded-For is whatever the
// client wanted it to be, so the socket's address is the only trusted one.
export function resolveClientIp(request: Pick<IncomingMessage, 'socket'>): string {
	const address = request.socket.remoteAddress;

	if (!address) {
		return UNKNOWN_CLIENT_IP;
	}

	return address.startsWith(IPV4_MAPPED_PREFIX) ? address.slice(IPV4_MAPPED_PREFIX.length) : address;
}

// A body is present when the client announced one; only bodiless requests
// can be sent twice.
export function hasRequestBody(request: Pick<IncomingMessage, 'headers'>): boolean {
	const contentLength = Number(request.headers['content-length'] ?? 0);

	return contentLength > 0 || request.headers['transfer-encoding'] !== undefined;
}
