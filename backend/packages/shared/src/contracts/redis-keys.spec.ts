import { describe, expect, it } from 'vitest';

import {
	anonymousConsumerKey,
	chaosStateKey,
	CONFIG_CHANGED_CHANNEL,
	consumerRateLimitKey,
	GATEWAY_EVENTS_CHANNEL,
	HEARTBEAT_KEY_PATTERN,
	heartbeatKey,
	INSTANCE_STATE_HASH,
	REQUEST_LOG_LIST,
	routeRateLimitKey,
} from './redis-keys.js';

describe('gateway redis keys', () => {
	it('names the shared channels and structures', () => {
		expect(CONFIG_CHANGED_CHANNEL).toBe('pyle:gw:config-changed');
		expect(GATEWAY_EVENTS_CHANNEL).toBe('pyle:gw:events');
		expect(INSTANCE_STATE_HASH).toBe('pyle:gw:instance-state');
		expect(REQUEST_LOG_LIST).toBe('pyle:gw:request-log');
		expect(HEARTBEAT_KEY_PATTERN).toBe('pyle:gw:heartbeat:*');
	});

	it('builds the per-entity keys', () => {
		expect(heartbeatKey('gw-a')).toBe('pyle:gw:heartbeat:gw-a');
		expect(consumerRateLimitKey('c1', 60000)).toBe('pyle:gw:rl:consumer:c1:60000');
		expect(routeRateLimitKey('r1', anonymousConsumerKey('10.0.0.1'), 0)).toBe('pyle:gw:rl:route:r1:anon:10.0.0.1:0');
		expect(chaosStateKey('i1')).toBe('pyle:gw:chaos:i1');
	});
});
