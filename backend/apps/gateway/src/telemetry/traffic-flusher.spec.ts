import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GatewayEvent } from '@pyle/shared/contracts/gateway-events.js';

import type { CompletedRequest } from '../contracts/request-observer.js';
import { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { TrafficAggregator, type TrafficBucket } from './traffic-aggregator.js';
import { FLUSH_GRACE_MS, MAX_PENDING_BUCKETS, TrafficFlusher, type SampleWriter } from './traffic-flusher.js';

const REQUEST: CompletedRequest = {
	requestId: 'r',
	startedAtMs: 0,
	finishedAtMs: 0,
	method: 'GET',
	path: '/',
	routeId: 'route-1',
	routeName: 'Pedidos',
	consumerId: null,
	consumerSlug: null,
	instanceId: 'instance-1',
	instanceName: 'orders-1',
	status: 200,
	attempts: 1,
	gatewayError: null,
};

function build(write: SampleWriter = vi.fn().mockResolvedValue(undefined)) {
	const aggregator = new TrafficAggregator();
	const events: GatewayEvent[] = [];
	const lines: string[] = [];
	const flusher = new TrafficFlusher({
		gatewayId: 'gw',
		aggregator,
		write,
		eventSink: () => ({ emit: (event) => events.push(event) }),
		logger: new GatewayLogger('gw', (line) => lines.push(line)),
		now: Date.now,
	});
	const record = (finishedAtMs: number, routeId: string | null = 'route-1') =>
		aggregator.onRequestCompleted({ ...REQUEST, startedAtMs: finishedAtMs, finishedAtMs, routeId });

	return { flusher, aggregator, events, lines, write: vi.mocked(write), record };
}

describe('TrafficFlusher', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(25_000);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('writes closed buckets just past each edge and announces them with their routes', async () => {
		const { flusher, events, write, record } = build();

		record(15_000);
		record(15_500, null);
		record(25_000);
		flusher.start();

		await vi.advanceTimersByTimeAsync(5000 + FLUSH_GRACE_MS - 1);
		expect(write).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);

		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].map((bucket: TrafficBucket) => bucket.bucketStartMs)).toEqual([10_000, 20_000]);
		expect(events).toEqual([
			{ type: 'traffic.flushed', gatewayId: 'gw', bucketStart: '1970-01-01T00:00:10.000Z', routeIds: ['route-1'] },
			{ type: 'traffic.flushed', gatewayId: 'gw', bucketStart: '1970-01-01T00:00:20.000Z', routeIds: ['route-1'] },
		]);
		await flusher.stop();
	});

	it('keeps failed buckets and writes them with the next ones', async () => {
		const write = vi.fn<SampleWriter>().mockRejectedValueOnce(new Error('db down')).mockResolvedValue(undefined);
		const { flusher, record, lines, events } = build(write);

		record(15_000);

		await flusher.flushClosed();
		expect(flusher.pendingCount).toBe(1);
		expect(lines.at(-1)).toContain('db down');
		expect(events).toEqual([]);
		vi.setSystemTime(35_000);
		record(25_000);
		await flusher.flushClosed();

		expect(write.mock.calls[1][0].map((bucket) => bucket.bucketStartMs)).toEqual([10_000, 20_000]);
		expect(flusher.pendingCount).toBe(0);
	});

	it('drops the oldest buckets past the pending limit, saying so', async () => {
		const write = vi.fn<SampleWriter>().mockRejectedValue(new Error('db down'));
		const { flusher, record, lines } = build(write);

		for (let index = 0; index <= MAX_PENDING_BUCKETS; index++) {
			record(index * 10_000);
			vi.setSystemTime((index + 1) * 10_000);
			await flusher.flushClosed();
		}

		expect(flusher.pendingCount).toBe(MAX_PENDING_BUCKETS);
		expect(lines.some((line) => line.includes('Dropped traffic buckets') && line.includes('1970-01-01T00:00:00.000Z'))).toBe(true);
	});

	it('writes nothing when there is nothing', async () => {
		const { flusher, write } = build();

		await flusher.flushClosed();

		expect(write).not.toHaveBeenCalled();
	});

	it('shares one write between overlapping flushes', async () => {
		let release: () => void = () => undefined;
		const write = vi.fn<SampleWriter>(() => new Promise((resolve) => (release = resolve)));
		const { flusher, record } = build(write);

		record(15_000);

		const first = flusher.flushClosed();
		const second = flusher.flushClosed();

		release();
		await Promise.all([first, second]);

		expect(write).toHaveBeenCalledTimes(1);
	});

	it('writes the open bucket too on stop, and schedules nothing after', async () => {
		const { flusher, write, record } = build();

		flusher.start();
		record(25_000);

		await flusher.stop();
		await vi.advanceTimersByTimeAsync(60_000);

		expect(write).toHaveBeenCalledTimes(1);
		expect(write.mock.calls[0][0].map((bucket: TrafficBucket) => bucket.bucketStartMs)).toEqual([20_000]);
		expect(vi.getTimerCount()).toBe(0);
	});
});
