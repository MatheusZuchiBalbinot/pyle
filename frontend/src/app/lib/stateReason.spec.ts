import { describe, expect, it } from 'vitest';

import { toReasonMessage } from './stateReason';

describe('toReasonMessage', () => {
	it.each([
		['3 consecutive failed health checks (HTTP 503)', 'gateway.reason.failedChecks', { count: '3', detail: 'HTTP 503' }],
		['2 consecutive successful health checks', 'gateway.reason.passedChecks', { count: '2' }],
		['5 consecutive request failures (timeout)', 'gateway.reason.failedRequests', { count: '5', detail: 'timeout' }],
		['probe request failed (ECONNREFUSED)', 'gateway.reason.probeFailed', { detail: 'ECONNREFUSED' }],
		['cooldown elapsed, probing', 'gateway.reason.probing', {}],
		['probe request succeeded', 'gateway.reason.probeSucceeded', {}],
	])('reads %s', (reason, key, values) => {
		expect(toReasonMessage(reason)).toEqual({ key, values });
	});

	it('leaves unknown reasons alone', () => {
		expect(toReasonMessage('something new')).toBeNull();
	});
});
