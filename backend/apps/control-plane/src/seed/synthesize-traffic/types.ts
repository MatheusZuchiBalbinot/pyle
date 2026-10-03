import type { GatewayAlertKindName, InstanceStateKindName, InstanceStateName } from '@pyle/shared/contracts/names.js';

import type { ConfigChangeDetail } from '../../gateway-config/domain/config-change-detail.js';

// Shapes shared by the curve/noise, narrative and row-builder modules: the
// synthesis input/catalog, the rows it produces, and the per-bucket working
// state threaded through them.

export const SEED_GATEWAY_ID = 'seed';
const HOURS_PER_DAY = 24;

export const HISTORY_HOURS = HOURS_PER_DAY;
export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60 * MS_PER_SECOND;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;

export type Random = () => number;

export type SynthesisInstance = { readonly instanceId: string; readonly name: string; readonly weight: number };
export type SynthesisRoute = { readonly routeId: string; readonly pathPrefix: string; readonly serviceSlug: string };

export type SynthesisCatalog = {
	readonly routes: readonly SynthesisRoute[];
	readonly instancesByService: ReadonlyMap<string, readonly SynthesisInstance[]>;
	readonly consumerIdBySlug: ReadonlyMap<string, string>;
};

export type SynthesisInput = {
	readonly catalog: SynthesisCatalog;
	readonly nowMs: number;
	readonly random: Random;
	// Hour of the day for a timestamp (local time in the seed; UTC in tests).
	readonly hourOf: (timestampMs: number) => number;
};

export type InstanceSampleRow = Counts & {
	readonly flushKey: string;
	readonly gatewayId: string;
	readonly bucketStart: Date;
	readonly routeId: string | null;
	readonly instanceId: string | null;
};

export type ConsumerSampleRow = Omit<Counts, 'status2xx' | 'status3xx' | 'gatewayErrorCount' | 'retryCount'> & {
	readonly flushKey: string;
	readonly gatewayId: string;
	readonly bucketStart: Date;
	readonly routeId: string | null;
	readonly consumerId: string | null;
};

export type StateEventRow = {
	readonly instanceId: string;
	readonly gatewayId: string;
	readonly kind: InstanceStateKindName;
	readonly fromState: InstanceStateName;
	readonly toState: InstanceStateName;
	readonly reason: string;
	readonly occurredAt: Date;
};

export type AlertRow = {
	readonly kind: GatewayAlertKindName;
	readonly severity: 'warning' | 'critical';
	readonly subjectType: 'route' | 'instance';
	readonly subjectId: string;
	readonly message: string;
	readonly triggeredAt: Date;
	readonly resolvedAt: Date;
};

export type Counts = {
	requestCount: number;
	status2xx: number;
	status3xx: number;
	status4xx: number;
	status5xx: number;
	rateLimitedCount: number;
	gatewayErrorCount: number;
	retryCount: number;
	latencyBuckets: number[];
	latencySumMs: number;
};

export type ConfigChangeRow = {
	readonly entityType: 'instance';
	readonly entityId: string;
	readonly entityName: string;
	readonly action: 'updated';
	readonly summary: string;
	readonly detail: ConfigChangeDetail;
	readonly occurredAt: Date;
};

export type SyntheticHistory = {
	readonly instanceSamples: readonly InstanceSampleRow[];
	readonly consumerSamples: readonly ConsumerSampleRow[];
	readonly stateEvents: readonly StateEventRow[];
	readonly alerts: readonly AlertRow[];
	readonly configChanges: readonly ConfigChangeRow[];
};

export type ConsumerShare = { readonly slug: string | null; readonly share: number };
export type RouteTraffic = { readonly peakRps: number; readonly consumers: readonly ConsumerShare[] };

export type Narrative = {
	readonly slowStartMs: number;
	readonly slowEndMs: number;
	readonly outageStartMs: number;
	readonly outageEndMs: number;
	readonly weightChangeAtMs: number;
};

// Requests from one consumer to one instance (or to the gateway alone) in a bucket.
export type RecordedBatch = {
	readonly statusCounts: readonly (readonly [status: number, count: number])[];
	// Per latency bucket; adds up to the batch's size.
	readonly latencyCounts: readonly number[];
	readonly rateLimitedCount: number;
};

export type StatusField = 'status2xx' | 'status4xx' | 'status5xx';

export type BucketRows = {
	readonly instances: Map<string, { readonly routeId: string; readonly instanceId: string | null; readonly counts: Counts }>;
	readonly consumers: Map<string, { readonly routeId: string; readonly consumerId: string | null; readonly counts: Counts }>;
};

export type BucketContext = {
	readonly input: SynthesisInput;
	readonly narrative: Narrative;
	readonly bucketStartMs: number;
	readonly rows: BucketRows;
};
