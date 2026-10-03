import type { PrismaClient } from '@prisma/control-plane-client';

import { toBucketStart, TRAFFIC_BUCKET_MS } from '@pyle/shared/contracts/latency-histogram.js';
import { toErrorMessage } from '@pyle/shared/utils/to-error-message.js';

import type { GatewayEventSink } from '../contracts/gateway-event-sink.js';
import type { GatewayLogger } from '../infrastructure/gateway-logger.js';
import { flushKey } from './sample-key.js';
import type { TrafficAggregator, TrafficBucket } from './traffic-aggregator.js';

// Past the bucket's edge, so requests finishing right at it are counted.
export const FLUSH_GRACE_MS = 1000;
// Buckets kept while the database is unreachable; older ones are dropped.
export const MAX_PENDING_BUCKETS = 30;

export type SampleWriter = (buckets: readonly TrafficBucket[], gatewayId: string) => Promise<void>;

type TrafficFlusherOptions = {
	readonly gatewayId: string;
	readonly aggregator: TrafficAggregator;
	readonly write: SampleWriter;
	readonly eventSink: () => GatewayEventSink;
	readonly logger: GatewayLogger;
	readonly now: () => number;
};

// Aligned to bucket edges; a failed write keeps the buckets for the next round.
export class TrafficFlusher {
	private pending: TrafficBucket[] = [];
	private timer: ReturnType<typeof setTimeout> | null = null;
	private inFlight: Promise<void> | null = null;
	private isRunning = false;

	constructor(private readonly options: TrafficFlusherOptions) {}

	start(): void {
		this.isRunning = true;
		this.scheduleNext();
	}

	// Writes whatever is closed now. Concurrent calls share one write.
	flushClosed(): Promise<void> {
		return this.flush(() => this.options.aggregator.drainClosedBuckets(this.options.now()));
	}

	// Stops the timer and writes everything, the open bucket included.
	async stop(): Promise<void> {
		this.isRunning = false;

		if (this.timer) {
			clearTimeout(this.timer);
		}

		this.timer = null;
		await this.inFlight;
		await this.flush(() => this.options.aggregator.drainAll());
	}

	get pendingCount(): number {
		return this.pending.length;
	}

	private scheduleNext(): void {
		if (!this.isRunning) {
			return;
		}

		const now = this.options.now();
		const nextFlushAt = toBucketStart(now) + TRAFFIC_BUCKET_MS + FLUSH_GRACE_MS;

		this.timer = setTimeout(() => {
			void this.flushClosed().finally(() => this.scheduleNext());
		}, nextFlushAt - now);
	}

	private flush(drain: () => readonly TrafficBucket[]): Promise<void> {
		if (this.inFlight) {
			return this.inFlight;
		}

		this.inFlight = this.writePending(drain).finally(() => {
			this.inFlight = null;
		});

		return this.inFlight;
	}

	private async writePending(drain: () => readonly TrafficBucket[]): Promise<void> {
		this.pending = [...this.pending, ...drain()];
		this.dropOverflow();

		if (this.pending.length === 0) {
			return;
		}

		const buckets = this.pending;

		try {
			await this.options.write(buckets, this.options.gatewayId);
		} catch (error) {
			this.options.logger.warnThrottled(
				'traffic-flush',
				TRAFFIC_BUCKET_MS * MAX_PENDING_BUCKETS,
				'Could not write traffic samples; keeping them for the next flush',
				{
					pendingBuckets: buckets.length,
					error: toErrorMessage(error),
				},
			);

			return;
		}

		// Writes are serialized, so nothing joined the list meanwhile.
		this.pending = [];

		for (const bucket of buckets) {
			this.announce(bucket);
		}
	}

	private dropOverflow(): void {
		const overflow = this.pending.length - MAX_PENDING_BUCKETS;

		if (overflow <= 0) {
			return;
		}

		const dropped = this.pending.slice(0, overflow);

		this.pending = this.pending.slice(overflow);
		const droppedBucketStarts = dropped.map((bucket) => new Date(bucket.bucketStartMs).toISOString());

		this.options.logger.error('Dropped traffic buckets that could not be written in time', { droppedBucketStarts });
	}

	private announce(bucket: TrafficBucket): void {
		const event = {
			type: 'traffic.flushed',
			gatewayId: this.options.gatewayId,
			bucketStart: new Date(bucket.bucketStartMs).toISOString(),
			routeIds: routeIdsOf(bucket),
		} as const;

		this.options.eventSink().emit(event);
	}
}

// Both sample tables in one transaction; skipDuplicates plus the flush key
// makes a retried flush write nothing twice.
export function createPrismaSampleWriter(prisma: PrismaClient): SampleWriter {
	return async (buckets, gatewayId) => {
		const instanceRows = buckets.flatMap((bucket) =>
			bucket.instances.map((row) => ({
				...row,
				flushKey: flushKey({ gatewayId, bucketStartMs: bucket.bucketStartMs, routeId: row.routeId, dimensionId: row.instanceId }),
				gatewayId,
				bucketStart: new Date(bucket.bucketStartMs),
			})),
		);
		const consumerRows = buckets.flatMap((bucket) =>
			bucket.consumers.map((row) => ({
				...row,
				flushKey: flushKey({ gatewayId, bucketStartMs: bucket.bucketStartMs, routeId: row.routeId, dimensionId: row.consumerId }),
				gatewayId,
				bucketStart: new Date(bucket.bucketStartMs),
			})),
		);

		await prisma.$transaction([
			prisma.routeInstanceSample.createMany({ data: instanceRows, skipDuplicates: true }),
			prisma.routeConsumerSample.createMany({ data: consumerRows, skipDuplicates: true }),
		]);
	};
}

function routeIdsOf(bucket: TrafficBucket): readonly string[] {
	const routeIds = new Set<string>();

	for (const row of bucket.instances) {
		if (row.routeId !== null) {
			routeIds.add(row.routeId);
		}
	}

	return [...routeIds];
}
