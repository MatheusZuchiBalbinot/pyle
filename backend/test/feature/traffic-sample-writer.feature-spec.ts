import 'dotenv/config';

import { PrismaClient } from '@prisma/control-plane-client';

import { emptyHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import type { TrafficBucket } from '../../apps/gateway/src/telemetry/traffic-aggregator.js';
import { createPrismaSampleWriter } from '../../apps/gateway/src/telemetry/traffic-flusher.js';

// The flush key is what makes a retried flush safe: proven against the
// real unique index.
const GATEWAY_ID = `feat-gw-${Date.now()}`;

function histogramWith(count: number): number[] {
	const histogram = emptyHistogram();

	histogram[3] = count;

	return histogram;
}

const BUCKET: TrafficBucket = {
	bucketStartMs: 1_790_000_000_000,
	instances: [
		{
			routeId: 'route-a',
			instanceId: 'instance-a',
			requestCount: 5,
			status2xx: 4,
			status3xx: 0,
			status4xx: 0,
			status5xx: 1,
			rateLimitedCount: 0,
			gatewayErrorCount: 0,
			retryCount: 1,
			latencyBuckets: histogramWith(5),
			latencySumMs: 150,
		},
		{
			routeId: null,
			instanceId: null,
			requestCount: 1,
			status2xx: 0,
			status3xx: 0,
			status4xx: 1,
			status5xx: 0,
			rateLimitedCount: 0,
			gatewayErrorCount: 0,
			retryCount: 0,
			latencyBuckets: histogramWith(1),
			latencySumMs: 1,
		},
	],
	consumers: [
		{
			routeId: 'route-a',
			consumerId: null,
			requestCount: 5,
			status4xx: 0,
			status5xx: 1,
			rateLimitedCount: 0,
			latencyBuckets: histogramWith(5),
			latencySumMs: 150,
		},
	],
};

describe('traffic sample writer (feature)', () => {
	const prisma = new PrismaClient();

	afterAll(async () => {
		await prisma.routeInstanceSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.routeConsumerSample.deleteMany({ where: { gatewayId: GATEWAY_ID } });
		await prisma.$disconnect();
	});

	it('writes both sample tables, and writing the same bucket again adds nothing', async () => {
		const write = createPrismaSampleWriter(prisma);

		await write([BUCKET], GATEWAY_ID);
		await write([BUCKET], GATEWAY_ID);

		const instanceRows = await prisma.routeInstanceSample.findMany({ where: { gatewayId: GATEWAY_ID }, orderBy: { requestCount: 'desc' } });
		const consumerRows = await prisma.routeConsumerSample.findMany({ where: { gatewayId: GATEWAY_ID } });

		expect(instanceRows).toHaveLength(2);
		expect(instanceRows[0]).toMatchObject({
			flushKey: `${GATEWAY_ID}:${BUCKET.bucketStartMs}:route-a:instance-a`,
			bucketStart: new Date(BUCKET.bucketStartMs),
			requestCount: 5,
			status5xx: 1,
			retryCount: 1,
			latencyBuckets: histogramWith(5),
		});
		expect(instanceRows[1].flushKey).toBe(`${GATEWAY_ID}:${BUCKET.bucketStartMs}:none:none`);
		expect(consumerRows).toEqual([expect.objectContaining({ consumerId: null, flushKey: `${GATEWAY_ID}:${BUCKET.bucketStartMs}:route-a:none` })]);
	});
});
