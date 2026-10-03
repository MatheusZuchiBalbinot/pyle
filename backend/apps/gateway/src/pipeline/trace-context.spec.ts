import { describe, expect, it } from 'vitest';

import { formatTraceparent, resolveTraceContext, type RandomHex } from './trace-context.js';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const CALLER_SPAN = '00f067aa0ba902b7';

// Deterministic ids: "a" repeated for trace ids, "b" for span ids.
const fakeHex: RandomHex = (bytes) => (bytes === 16 ? 'a' : 'b').repeat(bytes * 2);

describe('resolveTraceContext', () => {
	it("joins the caller's trace, as a new span under the caller's, keeping its flags", () => {
		const context = resolveTraceContext(`00-${TRACE_ID}-${CALLER_SPAN}-00`, fakeHex);

		expect(context).toEqual({ traceId: TRACE_ID, spanId: 'b'.repeat(16), flags: '00' });
		expect(formatTraceparent(context)).toBe(`00-${TRACE_ID}-${'b'.repeat(16)}-00`);
	});

	it('accepts the header in upper case and with surrounding spaces', () => {
		expect(resolveTraceContext(` 00-${TRACE_ID.toUpperCase()}-${CALLER_SPAN}-01 `, fakeHex).traceId).toBe(TRACE_ID);
	});

	it.each([
		['no header', undefined],
		['a repeated header', [`00-${TRACE_ID}-${CALLER_SPAN}-01`, `00-${TRACE_ID}-${CALLER_SPAN}-01`]],
		['garbage', 'not-a-trace'],
		['an unknown version', `01-${TRACE_ID}-${CALLER_SPAN}-01`],
		['an all-zero trace id', `00-${'0'.repeat(32)}-${CALLER_SPAN}-01`],
		['an all-zero parent id', `00-${TRACE_ID}-${'0'.repeat(16)}-01`],
	])('starts a new sampled trace on %s', (_name, incoming) => {
		expect(resolveTraceContext(incoming, fakeHex)).toEqual({ traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), flags: '01' });
	});

	it('generates ids of the right size by default', () => {
		const traceparent = formatTraceparent(resolveTraceContext(undefined));

		expect(traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
	});
});
