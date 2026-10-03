import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/control-plane-client';

import { LATENCY_HISTOGRAM_LENGTH } from '@pyle/shared/contracts/latency-histogram.js';

import { ControlPlanePrismaService } from '../../control-plane/prisma/control-plane-prisma.service.js';
import type { SampleRow } from '../domain/traffic-types.js';

// date_bin's origin: a fixed instant on a 10 s / 60 s / 300 s edge, so the
// database's steps line up with the gateway's 10 s buckets.
const DATE_BIN_ORIGIN = Prisma.sql`TIMESTAMP '2000-01-01 00:00:00'`;

// Element-wise sum of the histograms: one SUM per position (Postgres
// arrays are 1-based). Built from a constant, never from input.
const HISTOGRAM_SUM = Prisma.raw(
	`ARRAY[${Array.from({ length: LATENCY_HISTOGRAM_LENGTH }, (_value, index) => `COALESCE(SUM("latencyBuckets"[${index + 1}]), 0)::int`).join(', ')}]`,
);

type InstanceSampleGrouping = 'route' | 'instance' | null;
type ConsumerSampleGrouping = 'consumer' | 'route' | null;

const INSTANCE_KEY_COLUMN: Readonly<Record<Exclude<InstanceSampleGrouping, null>, Prisma.Sql>> = {
	route: Prisma.sql`"routeId"`,
	instance: Prisma.sql`"instanceId"`,
};

const CONSUMER_KEY_COLUMN: Readonly<Record<Exclude<ConsumerSampleGrouping, null>, Prisma.Sql>> = {
	consumer: Prisma.sql`"consumerId"`,
	route: Prisma.sql`"routeId"`,
};

type InstanceSampleQuery = TimeRange & {
	readonly groupBy: InstanceSampleGrouping;
	readonly routeId?: string;
	readonly instanceIds?: readonly string[];
};

type ConsumerSampleQuery = TimeRange & {
	readonly groupBy: ConsumerSampleGrouping;
	readonly consumerId?: string;
};

type TimeRange = {
	readonly from: Date;
	readonly to: Date;
	// Null aggregates the whole range into one row per key.
	readonly stepSeconds: number | null;
};

// Aggregated in Postgres: a busy 24 h window is thousands of rows, the answer a few hundred
// points.
@Injectable()
export class TrafficSampleRepository {
	constructor(private readonly prisma: ControlPlanePrismaService) {}

	aggregateInstanceSamples(query: InstanceSampleQuery): Promise<SampleRow[]> {
		const conditions = [Prisma.sql`"bucketStart" >= ${query.from}`, Prisma.sql`"bucketStart" < ${query.to}`];

		if (query.routeId !== undefined) {
			conditions.push(Prisma.sql`"routeId" = ${query.routeId}`);
		}

		if (query.instanceIds !== undefined) {
			conditions.push(Prisma.sql`"instanceId" = ANY(${[...query.instanceIds]}::text[])`);
		}

		const key = keyColumn(query.groupBy === null ? null : INSTANCE_KEY_COLUMN[query.groupBy]);

		return this.prisma.$queryRaw<SampleRow[]>`
			SELECT ${timeColumn(query.stepSeconds)} AS "at", ${key} AS "key",
				COALESCE(SUM("requestCount"), 0)::int AS "requestCount",
				COALESCE(SUM("status2xx"), 0)::int AS "status2xx",
				COALESCE(SUM("status3xx"), 0)::int AS "status3xx",
				COALESCE(SUM("status4xx"), 0)::int AS "status4xx",
				COALESCE(SUM("status5xx"), 0)::int AS "status5xx",
				COALESCE(SUM("rateLimitedCount"), 0)::int AS "rateLimitedCount",
				COALESCE(SUM("gatewayErrorCount"), 0)::int AS "gatewayErrorCount",
				COALESCE(SUM("retryCount"), 0)::int AS "retryCount",
				${HISTOGRAM_SUM} AS "latencyBuckets"
			FROM "RouteInstanceSample"
			WHERE ${Prisma.join(conditions, ' AND ')}
			GROUP BY 1, 2
			ORDER BY 1, 2`;
	}

	aggregateConsumerSamples(query: ConsumerSampleQuery): Promise<SampleRow[]> {
		const conditions = [Prisma.sql`"bucketStart" >= ${query.from}`, Prisma.sql`"bucketStart" < ${query.to}`];

		if (query.consumerId !== undefined) {
			conditions.push(Prisma.sql`"consumerId" = ${query.consumerId}`);
		}

		const key = keyColumn(query.groupBy === null ? null : CONSUMER_KEY_COLUMN[query.groupBy]);

		return this.prisma.$queryRaw<SampleRow[]>`
			SELECT ${timeColumn(query.stepSeconds)} AS "at", ${key} AS "key",
				COALESCE(SUM("requestCount"), 0)::int AS "requestCount",
				0 AS "status2xx",
				0 AS "status3xx",
				COALESCE(SUM("status4xx"), 0)::int AS "status4xx",
				COALESCE(SUM("status5xx"), 0)::int AS "status5xx",
				COALESCE(SUM("rateLimitedCount"), 0)::int AS "rateLimitedCount",
				0 AS "gatewayErrorCount",
				0 AS "retryCount",
				${HISTOGRAM_SUM} AS "latencyBuckets"
			FROM "RouteConsumerSample"
			WHERE ${Prisma.join(conditions, ' AND ')}
			GROUP BY 1, 2
			ORDER BY 1, 2`;
	}
}

function timeColumn(stepSeconds: number | null): Prisma.Sql {
	if (stepSeconds === null) {
		return Prisma.sql`NULL::timestamp`;
	}

	return Prisma.sql`date_bin(make_interval(secs => ${stepSeconds}), "bucketStart", ${DATE_BIN_ORIGIN})`;
}

function keyColumn(column: Prisma.Sql | null): Prisma.Sql {
	return column ?? Prisma.sql`NULL::text`;
}
