import { describe, expect, it, vi } from 'vitest';

import { GATEWAY_EVENTS_CHANNEL } from '@pyle/shared/contracts/redis-keys.js';

import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { RedisEventSink } from './redis-event-sink.js';

const EVENT = { type: 'gateway.started', gatewayId: 'gw', occurredAt: '2026-09-26T00:00:00.000Z' } as const;

describe('RedisEventSink', () => {
	it('publishes the event as JSON', () => {
		const publish = vi.fn().mockResolvedValue(1);

		new RedisEventSink({ publish }, new GatewayLogger('gw', () => undefined)).emit(EVENT);

		expect(publish).toHaveBeenCalledWith(GATEWAY_EVENTS_CHANNEL, JSON.stringify(EVENT));
	});

	it('logs a failed publish instead of throwing', async () => {
		const lines: string[] = [];
		const publish = vi.fn().mockRejectedValue(new Error('down'));

		new RedisEventSink({ publish }, new GatewayLogger('gw', (line) => lines.push(line))).emit(EVENT);

		await vi.waitFor(() => expect(lines.at(-1)).toContain('gateway.started'));
	});
});
