import { Test, type TestingModule } from '@nestjs/testing';

import { emptyHistogram } from '@pyle/shared/contracts/latency-histogram.js';

import { AppModule } from '../../apps/control-plane/src/app.module.js';
import { ControlPlanePrismaService } from '../../apps/control-plane/src/control-plane/prisma/control-plane-prisma.service.js';
import { TrafficSampleRepository } from '../../apps/control-plane/src/traffic/infrastructure/traffic-sample.repository.js';

// The aggregation runs in Postgres (date_bin, element-wise histogram sums):
// only a real database can prove it adds up.
const RUN = `feat-traffic-${Date.now()}`;
const ROUTE_A = `${RUN}-route-a`;
const ROUTE_B = `${RUN}-route-b`;
// 2026-09-26T12:00:00Z, a 300 s edge.
const BASE_MS = Date.UTC(2026, 8, 26, 12, 0, 0);
const BUCKET_MS = 10_000;

type SampleSeed = {
	readonly offsetBuckets: number;
	readonly routeId: string;
	readonly instanceId: string | null;
	readonly requestCount: number;
	readonly status5xx: number;
	readonly latencyIndex: number;
};

function histogramAt(index: number, count: number): number[] {
	const histogram = emptyHistogram();

	histogram[index] = count;

	return histogram;
}

// Twelve buckets (2 min) over two routes and two instances.
const SEEDS: readonly SampleSeed[] = Array.from({ length: 12 }, (_value, offset) => [
	{ offsetBuckets: offset, routeId: ROUTE_A, instanceId: `${RUN}-i1`, requestCount: 10, status5xx: 1, latencyIndex: 2 },
	{ offsetBuckets: offset, routeId: ROUTE_A, instanceId: `${RUN}-i2`, requestCount: 5, status5xx: 0, latencyIndex: 6 },
	{ offsetBuckets: offset, routeId: ROUTE_B, instanceId: null, requestCount: 2, status5xx: 2, latencyIndex: 0 },
]).flat();

describe('traffic sample repository (feature)', () => {
	let moduleFixture: TestingModule;
	let prisma: ControlPlanePrismaService;
	let repository: TrafficSampleRepository;
	const from = new Date(BASE_MS);
	const to = new Date(BASE_MS + 12 * BUCKET_MS);

	beforeAll(async () => {
		moduleFixture = await Test.createTestingModule({ imports: [AppModule] }).compile();
		await moduleFixture.init();
		prisma = moduleFixture.get(ControlPlanePrismaService, { strict: false });
		repository = moduleFixture.get(TrafficSampleRepository, { strict: false });
		const instanceRows = SEEDS.map((seed) => ({
			flushKey: `${RUN}:${seed.offsetBuckets}:${seed.routeId}:${seed.instanceId}`,
			gatewayId: RUN,
			bucketStart: new Date(BASE_MS + seed.offsetBuckets * BUCKET_MS),
			routeId: seed.routeId,
			instanceId: seed.instanceId,
			requestCount: seed.requestCount,
			status2xx: seed.requestCount - seed.status5xx,
			status3xx: 0,
			status4xx: 0,
			status5xx: seed.status5xx,
			rateLimitedCount: 0,
			gatewayErrorCount: 0,
			retryCount: 1,
			latencyBuckets: histogramAt(seed.latencyIndex, seed.requestCount),
			latencySumMs: 0,
		}));

		await prisma.routeInstanceSample.createMany({ data: instanceRows });
		const consumerRows = SEEDS.map((seed) => ({
			flushKey: `${RUN}:${seed.offsetBuckets}:${seed.routeId}:${seed.instanceId}:c`,
			gatewayId: RUN,
			bucketStart: new Date(BASE_MS + seed.offsetBuckets * BUCKET_MS),
			routeId: seed.routeId,
			consumerId: seed.routeId === ROUTE_A ? `${RUN}-consumer` : null,
			requestCount: seed.requestCount,
			status4xx: 0,
			status5xx: seed.status5xx,
			rateLimitedCount: 1,
			latencyBuckets: histogramAt(seed.latencyIndex, seed.requestCount),
			latencySumMs: 0,
		}));

		await prisma.routeConsumerSample.createMany({ data: consumerRows });
	});

	afterAll(async () => {
		await prisma.routeInstanceSample.deleteMany({ where: { gatewayId: RUN } });
		await prisma.routeConsumerSample.deleteMany({ where: { gatewayId: RUN } });
		await moduleFixture.close();
	});

	it('sums per 60 s step, histograms element by element', async () => {
		const rows = await repository.aggregateInstanceSamples({ from, to, stepSeconds: 60, groupBy: null, routeId: ROUTE_A });

		expect(rows.map((row) => row.at?.toISOString())).toEqual(['2026-09-26T12:00:00.000Z', '2026-09-26T12:01:00.000Z']);
		expect(rows[0]).toMatchObject({ key: null, requestCount: 90, status5xx: 6, retryCount: 12 });
		expect(rows[0].latencyBuckets[2]).toBe(60);
		expect(rows[0].latencyBuckets[6]).toBe(30);
		expect(rows[0].latencyBuckets.reduce((sum, count) => sum + count, 0)).toBe(90);
	});

	it('sums a 300 s step into one row per key', async () => {
		const rows = await repository.aggregateInstanceSamples({ from, to, stepSeconds: 300, groupBy: 'instance' });
		const ours = rows.filter((row) => row.key === null || row.key.startsWith(RUN));

		expect(ours.map((row) => [row.key, row.requestCount])).toEqual(
			expect.arrayContaining([
				[`${RUN}-i1`, 120],
				[`${RUN}-i2`, 60],
			]),
		);
	});

	it('filters by instance ids and aggregates the whole range without a step', async () => {
		const rows = await repository.aggregateInstanceSamples({ from, to, stepSeconds: null, groupBy: 'route', instanceIds: [`${RUN}-i2`] });

		expect(rows).toEqual([expect.objectContaining({ at: null, key: ROUTE_A, requestCount: 60 })]);
	});

	it('aggregates consumer samples, zeros for what they do not carry', async () => {
		const rows = await repository.aggregateConsumerSamples({ from, to, stepSeconds: null, groupBy: 'route', consumerId: `${RUN}-consumer` });

		expect(rows).toEqual([expect.objectContaining({ key: ROUTE_A, requestCount: 180, rateLimitedCount: 24, status2xx: 0, retryCount: 0 })]);
	});
});
