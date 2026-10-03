import { request as httpRequest, type IncomingMessage, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pipeline } from 'node:stream';

import type { AttemptOutcome } from '../contracts/attempt-observer.js';
import type { UpstreamAgent } from './upstream-agents.js';
import type { UpstreamRequest } from './upstream-request.js';

const HTTPS_PROTOCOL = 'https:';
const UNKNOWN_ERROR_CODE = 'UNKNOWN';

// What one attempt produced. A response is handed back unread: the caller
// either relays it or, when retrying, discards it.
export type AttemptResult =
	{ readonly kind: 'response'; readonly response: IncomingMessage } | Exclude<AttemptOutcome, { readonly kind: 'response' }>;

export type AttemptInput = {
	readonly target: UpstreamRequest;
	readonly method: string;
	readonly agent: UpstreamAgent;
	// Socket inactivity allowed, from sending until the end of the response.
	readonly timeoutMs: number;
	// The client's body, streamed as it arrives; null sends none (the only
	// requests ever retried).
	readonly body: IncomingMessage | null;
	// Aborted when the client goes away.
	readonly signal: AbortSignal;
};

class AttemptTimeoutError extends Error {}

// One request to one instance, streamed both ways over node:http. Not
// fetch: fetch decompresses the response, which would hand the client a
// body that no longer matches its Content-Encoding header.
export function sendAttempt(input: AttemptInput): Promise<AttemptResult> {
	return new Promise((resolve) => {
		const requestFunction = input.target.url.protocol === HTTPS_PROTOCOL ? httpsRequest : httpRequest;
		const options: RequestOptions = { method: input.method, headers: input.target.headers, agent: input.agent, signal: input.signal };
		const upstreamRequest = requestFunction(input.target.url, options);

		upstreamRequest.setTimeout(input.timeoutMs, () => upstreamRequest.destroy(new AttemptTimeoutError()));

		upstreamRequest.once('response', (response) => resolve({ kind: 'response', response }));
		upstreamRequest.once('error', (error) => {
			if (input.signal.aborted) {
				return resolve({ kind: 'aborted' });
			}

			if (error instanceof AttemptTimeoutError) {
				return resolve({ kind: 'timeout' });
			}

			return resolve({ kind: 'connection_error', errorCode: errorCodeOf(error) });
		});

		if (input.body === null) {
			upstreamRequest.end();

			return;
		}

		pipeline(input.body, upstreamRequest, () => {
			// Failures surface through the upstream request's own 'error'.
		});
	});
}

function errorCodeOf(error: unknown): string {
	const code = (error as { readonly code?: unknown } | null)?.code;

	return typeof code === 'string' ? code : UNKNOWN_ERROR_CODE;
}
