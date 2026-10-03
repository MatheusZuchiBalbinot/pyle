import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CentrifugoApiError, type CentrifugoNodeClient } from '../infrastructure/centrifugo-node-client.js';
import { RealtimePublisherService } from './realtime-publisher.service.js';

function buildFakes() {
	const nodeClient = { publish: vi.fn().mockResolvedValue(undefined) } as unknown as CentrifugoNodeClient;

	return { nodeClient, service: new RealtimePublisherService(nodeClient) };
}

describe('RealtimePublisherService', () => {
	beforeEach(() => {
		process.env.CENTRIFUGO_URL = 'http://centrifugo:8000';
		process.env.CENTRIFUGO_PUBLIC_URL = 'ws://localhost:48000/connection/websocket';
		process.env.CENTRIFUGO_API_KEY = 'control-plane-key';
		process.env.CENTRIFUGO_TOKEN_HMAC_SECRET = 'secret';
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("publishes admin events, stamped with occurredAt, to the control plane's broker", async () => {
		const { nodeClient, service } = buildFakes();

		await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'up' });

		const [node, channel, event] = (nodeClient.publish as ReturnType<typeof vi.fn>).mock.calls[0] as [
			{ apiUrl: string; apiKey: string },
			string,
			{ type: string; occurredAt: string },
		];

		expect(node).toEqual({ apiUrl: 'http://centrifugo:8000', apiKey: 'control-plane-key' });
		expect(channel).toBe('admin:events');
		expect(event.type).toBe('gateway.status.changed');
		expect(Number.isNaN(Date.parse(event.occurredAt))).toBe(false);
	});

	it('never throws: a broker error is logged and swallowed', async () => {
		const { nodeClient, service } = buildFakes();

		(nodeClient.publish as ReturnType<typeof vi.fn>).mockRejectedValue(new CentrifugoApiError('unknown channel'));
		await expect(service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' })).resolves.toBeUndefined();
	});

	describe('the in-process mirror of the admin channel', () => {
		it('runs every listener to completion before the broker publish', async () => {
			const order: string[] = [];
			const { nodeClient, service } = buildFakes();

			vi.mocked(nodeClient.publish).mockImplementation(async () => {
				order.push('broker');
			});
			service.onAdminEvent(async () => {
				await Promise.resolve();
				order.push('listener');
			});

			await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' });

			expect(order).toEqual(['listener', 'broker']);
		});

		it('hands every listener the same stamped event the broker gets', async () => {
			const seen: unknown[] = [];
			const { nodeClient, service } = buildFakes();

			service.onAdminEvent((event) => {
				seen.push(event);
			});

			await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' });

			const [, , publishedEvent] = vi.mocked(nodeClient.publish).mock.calls[0];

			expect(seen).toEqual([publishedEvent]);
			expect(seen[0]).toEqual(expect.objectContaining({ occurredAt: expect.any(String) }));
		});

		it('publishes anyway when a listener fails', async () => {
			const { nodeClient, service } = buildFakes();

			service.onAdminEvent(() => {
				throw new Error('inbox table locked');
			});

			await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' });

			expect(nodeClient.publish).toHaveBeenCalled();
		});

		it('runs one failing listener without stopping the others', async () => {
			const healthyListener = vi.fn();
			const { service } = buildFakes();

			service.onAdminEvent(() => Promise.reject(new Error('boom')));
			service.onAdminEvent(healthyListener);

			await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' });

			expect(healthyListener).toHaveBeenCalled();
		});
	});

	it('stops calling a listener once it unsubscribed', async () => {
		const listener = vi.fn();
		const { service } = buildFakes();
		const unsubscribe = service.onAdminEvent(listener);

		unsubscribe();
		await service.publishToAdmins({ type: 'gateway.status.changed', gatewayId: 'gw', status: 'down' });

		expect(listener).not.toHaveBeenCalled();
	});
});
