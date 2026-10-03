import { randomBytes } from 'node:crypto';

// W3C Trace Context (https://www.w3.org/TR/trace-context/): the gateway joins
// the caller's trace when it sends a valid traceparent, or starts one, and
// passes it to the instance with itself as the parent. It records no spans;
// it keeps the trace connected so the instances' spans line up with the caller's.

export const TRACEPARENT_HEADER = 'traceparent';

const SUPPORTED_VERSION = '00';
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;
const SAMPLED_FLAGS = '01';
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const ALL_ZEROS_PATTERN = /^0+$/;

export type TraceContext = {
	readonly traceId: string;
	// The gateway's span: the parent of what the instance does.
	readonly spanId: string;
	readonly flags: string;
};

export type RandomHex = (bytes: number) => string;

// An invalid or all-zero header is ignored, as the spec says: a new trace starts.
export function resolveTraceContext(incoming: string | string[] | undefined, randomHex: RandomHex = secureRandomHex): TraceContext {
	const match = typeof incoming === 'string' ? TRACEPARENT_PATTERN.exec(incoming.trim().toLowerCase()) : null;

	if (match === null) {
		return startTrace(randomHex);
	}

	const [, traceId, parentSpanId, flags] = match;
	const isUsable = !ALL_ZEROS_PATTERN.test(traceId) && !ALL_ZEROS_PATTERN.test(parentSpanId);

	if (!isUsable) {
		return startTrace(randomHex);
	}

	return { traceId, spanId: randomHex(SPAN_ID_BYTES), flags };
}

export function formatTraceparent(context: TraceContext): string {
	return `${SUPPORTED_VERSION}-${context.traceId}-${context.spanId}-${context.flags}`;
}

function secureRandomHex(bytes: number): string {
	return randomBytes(bytes).toString('hex');
}

function startTrace(randomHex: RandomHex): TraceContext {
	return { traceId: randomHex(TRACE_ID_BYTES), spanId: randomHex(SPAN_ID_BYTES), flags: SAMPLED_FLAGS };
}
