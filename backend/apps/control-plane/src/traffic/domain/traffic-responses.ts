import { ApiProperty } from '@nestjs/swagger';

import type { GatewayErrorCode } from '@pyle/shared/contracts/gateway-error.js';
import type { GatewayHeartbeat } from '@pyle/shared/contracts/instance-live-state.js';
import type { RequestLogEntry } from '@pyle/shared/contracts/request-log-entry.js';

import type { Page } from '../../common/pagination.js';
import type { ConsumerDto, RouteDto, ServiceDto } from '../../gateway-config/interface/dto/gateway-config-responses.js';
import type { TrafficPoint, TrafficTotals, TrafficWindowRange } from './traffic-types.js';

// Classes, not type aliases, so the Swagger plugin documents them. The *Dto classes that
// implement a domain or gateway type only describe it: the services keep returning
// plain objects of that type.

class TrafficWindowRangeDto implements TrafficWindowRange {
	readonly from!: string;
	readonly to!: string;
	readonly stepSeconds!: number;
}

class TrafficTotalsDto implements TrafficTotals {
	readonly requestCount!: number;
	readonly requestsPerSecond!: number;
	// 5xx / total, 0..1.
	readonly errorRate!: number;
	// 4xx excluding the gateway's 429 / total.
	readonly clientErrorRate!: number;
	readonly rateLimitedCount!: number;
	readonly p50Ms!: number | null;
	readonly p95Ms!: number | null;
	readonly p99Ms!: number | null;
	readonly retryCount!: number;
}

class TrafficPointDto implements TrafficPoint {
	// Step start.
	readonly at!: string;
	readonly requestsPerSecond!: number;
	readonly errorRate!: number;
	readonly rateLimitedCount!: number;
	readonly p50Ms!: number | null;
	readonly p95Ms!: number | null;
	readonly p99Ms!: number | null;
}

export class RouteTrafficSummaryDto {
	readonly routeId!: string;
	readonly name!: string;
	readonly pathPrefix!: string;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
}

export class TopConsumerDto {
	// Null = unauthenticated traffic.
	readonly consumerId!: string | null;
	readonly slug!: string | null;
	readonly name!: string | null;
	readonly requestCount!: number;
	readonly rateLimitedCount!: number;
}

export class TrafficOverviewDto {
	readonly window!: TrafficWindowRangeDto;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
	@ApiProperty({ type: [RouteTrafficSummaryDto] })
	readonly routes!: readonly RouteTrafficSummaryDto[];
	@ApiProperty({ type: [TopConsumerDto] })
	readonly topConsumers!: readonly TopConsumerDto[];
}

export class InstanceTrafficDto {
	readonly instanceId!: string;
	readonly name!: string;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
	// Fraction of the route's (or service's) requests this instance served.
	readonly share!: number;
}

export class StatusBreakdownDto {
	readonly status2xx!: number;
	readonly status3xx!: number;
	readonly status4xx!: number;
	readonly status5xx!: number;
	readonly rateLimited!: number;
	readonly gatewayErrors!: number;
}

export class RouteTrafficDto {
	readonly route!: RouteDto;
	readonly window!: TrafficWindowRangeDto;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
	@ApiProperty({ type: [InstanceTrafficDto] })
	readonly instances!: readonly InstanceTrafficDto[];
	readonly statusBreakdown!: StatusBreakdownDto;
}

export class ServiceTrafficDto {
	readonly service!: ServiceDto;
	readonly window!: TrafficWindowRangeDto;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
	@ApiProperty({ type: [InstanceTrafficDto] })
	readonly instances!: readonly InstanceTrafficDto[];
}

export class ConsumerRouteUsageDto {
	readonly routeId!: string | null;
	readonly name!: string | null;
	readonly requestCount!: number;
	readonly rateLimitedCount!: number;
}

export class ConsumerTrafficDto {
	readonly consumer!: ConsumerDto;
	readonly window!: TrafficWindowRangeDto;
	readonly totals!: TrafficTotalsDto;
	@ApiProperty({ type: [TrafficPointDto] })
	readonly series!: readonly TrafficPointDto[];
	@ApiProperty({ type: [ConsumerRouteUsageDto] })
	readonly routes!: readonly ConsumerRouteUsageDto[];
}

// A gateway's heartbeat plus whether it is recent enough to count as running.
export class GatewayStatusEntryDto implements GatewayHeartbeat {
	readonly gatewayId!: string;
	readonly startedAt!: string;
	readonly configVersion!: number;
	// The rate limiter could not reach Redis recently and is failing open.
	readonly isRateLimitDegraded!: boolean;
	readonly updatedAt!: string;
	readonly isAlive!: boolean;
}

export class GatewayStatusDto {
	@ApiProperty({ type: [GatewayStatusEntryDto] })
	readonly gateways!: readonly GatewayStatusEntryDto[];
	// The configuration version the control plane holds now; a gateway
	// reporting an older one has not reloaded yet.
	readonly configVersion!: number;
}

// The documented shape of the gateway contract's RequestLogEntry.
class RequestLogEntryDto implements RequestLogEntry {
	readonly requestId!: string;
	readonly at!: string;
	readonly method!: string;
	// Original path, query string removed.
	readonly path!: string;
	readonly routeId!: string | null;
	readonly routeName!: string | null;
	readonly consumerId!: string | null;
	readonly consumerSlug!: string | null;
	readonly instanceId!: string | null;
	readonly instanceName!: string | null;
	readonly status!: number;
	readonly durationMs!: number;
	readonly attempts!: number;
	readonly gatewayError!: GatewayErrorCode | null;
}

export class RequestLogPageDto implements Page<RequestLogEntry> {
	@ApiProperty({ type: [RequestLogEntryDto] })
	readonly items!: readonly RequestLogEntryDto[];
	// Null on the last page.
	readonly nextCursor!: string | null;
}
