import { describe, expect, it } from 'vitest';

import type { GatewayStatus } from '@/app/api/adminApiTypes';

import { isGatewayBehind } from './gatewayLag';

const CHANGE_AT = Date.parse('2026-10-03T12:00:00.000Z');

function gateway(configVersion: number, heartbeatAt: string): GatewayStatus['gateways'][number] {
	return {
		gatewayId: 'gw-local',
		startedAt: '2026-10-03T11:00:00.000Z',
		configVersion,
		isRateLimitDegraded: false,
		updatedAt: heartbeatAt,
		isAlive: true,
	};
}

describe('isGatewayBehind', () => {
	it('waits for a heartbeat sent after the change before calling a gateway behind', () => {
		expect(isGatewayBehind(gateway(CHANGE_AT - 1, '2026-10-03T11:59:58.000Z'), CHANGE_AT)).toBe(false);
		expect(isGatewayBehind(gateway(CHANGE_AT - 1, '2026-10-03T12:00:01.000Z'), CHANGE_AT)).toBe(false);
		expect(isGatewayBehind(gateway(CHANGE_AT - 1, '2026-10-03T12:00:05.000Z'), CHANGE_AT)).toBe(true);
	});

	it('is never behind on the current version', () => {
		expect(isGatewayBehind(gateway(CHANGE_AT, '2026-10-03T12:00:05.000Z'), CHANGE_AT)).toBe(false);
	});
});
